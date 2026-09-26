import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateIngestDto } from './dto/create-ingest.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { IngestService } from './ingest.service';

@ApiTags('ingest')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  @ApiOperation({
    summary:
      'Enregistrer une reprise à partir d’un post Facebook et de sa source',
    description:
      'La reprise attend ensuite la collecte du post d’origine, déposée par ' +
      'l’extension ou, à la main, par `scrape-result`.',
  })
  create(@Body() dto: CreateIngestDto) {
    return this.ingest.create(dto);
  }

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    return this.ingest.findAll(pagination);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ingest.findOne(id);
  }

  @Post(':id/scrape-result')
  @ApiOperation({
    summary: 'Déposer à la main le texte et l’image du post d’origine',
    description:
      'Tient lieu d’extension. La réponse attend que la lecture de la page ' +
      'source et la réécriture soient passées : compter une minute.',
  })
  async scrapeResult(@Param('id') id: string, @Body() dto: ScrapeResultDto) {
    await this.ingest.submitScrape(id, dto);
    return this.ingest.advance(id);
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Reprendre une reprise en échec là où elle s’est arrêtée',
  })
  retry(@Param('id') id: string) {
    return this.ingest.retry(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ingest.remove(id);
  }
}
