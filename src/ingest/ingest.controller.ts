import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ImageProviderDto } from './dto/image-provider.dto';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateIngestDto } from './dto/create-ingest.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { IngestService } from './ingest.service';
import { ImageTranslatorService, LANGUAGES } from './image-translator.service';

@ApiTags('ingest')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/ingest')
export class IngestController {
  constructor(
    private readonly ingest: IngestService,
    private readonly images: ImageTranslatorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('image-providers')
  @ApiOperation({ summary: 'IA d’image (mode « engagement ») : celles configurées sur le serveur, et les langues' })
  async imageProviders() {
    await this.images.load();
    return { providers: this.images.providers(), languages: { ...LANGUAGES } };
  }

  @Put('image-providers/:name')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Régler une IA d’image (clé, modèle, adresse) depuis la plateforme — ADMIN ; la clé n’est jamais renvoyée' })
  async configureImageProvider(@Param('name') name: string, @Body() dto: ImageProviderDto, @ActingUser() acting: CurrentUser) {
    const out = await this.images.configure(name, dto, acting?.username ?? null);
    // Le journal dit qui a changé quoi — jamais la clé.
    const changed = [dto.clearKey ? 'clé effacée' : dto.apiKey ? `clé ${out?.keyHint}` : '', dto.model !== undefined ? `modèle ${out?.model}` : '', dto.baseUrl !== undefined ? `adresse ${out?.baseUrl}` : ''].filter(Boolean).join(', ');
    await this.prisma.activityLog
      .create({ data: { eventType: 'IMAGE_PROVIDER_CONFIGURED', message: `IA d’image « ${out?.label} » réglée${changed ? ` : ${changed}` : ''}`, metadata: { provider: name, by: acting?.username ?? null } } })
      .catch(() => undefined);
    return out;
  }

  @Post()
  @ApiOperation({
    summary:
      'Enregistrer une reprise à partir d’un post Facebook et de sa source',
    description:
      'La reprise attend ensuite la collecte du post d’origine, déposée par ' +
      'l’extension ou, à la main, par `scrape-result`.',
  })
  create(@Body() dto: CreateIngestDto, @ActingUser() acting: CurrentUser) {
    return this.ingest.create(dto, acting);
  }

  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.ingest.findAll(pagination, acting);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.ingest.findOne(id, acting);
  }

  @Post(':id/scrape-result')
  @ApiOperation({
    summary: 'Déposer à la main le texte et l’image du post d’origine',
    description:
      'Tient lieu d’extension. La réponse attend que la lecture de la page ' +
      'source et la réécriture soient passées : compter une minute.',
  })
  async scrapeResult(
    @Param('id') id: string,
    @Body() dto: ScrapeResultDto,
    @ActingUser() acting: CurrentUser,
  ) {
    await this.ingest.submitScrape(id, dto, acting);
    return this.ingest.advance(id);
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Reprendre une reprise en échec là où elle s’est arrêtée',
  })
  retry(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.ingest.retry(id, acting);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.ingest.remove(id, acting);
  }
}
