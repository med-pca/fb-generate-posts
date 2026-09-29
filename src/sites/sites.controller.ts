import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';
import { PluginCheckService } from './plugin-check.service';

@ApiTags('sites')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('sites')
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly plugins: PluginCheckService,
  ) {}

  @Post('check')
  @ApiOperation({
    summary: 'Vérifier l’extension WordPress de tous ses sites',
    description:
      'Interroge la route `dfb/v1/status` de chaque site : connecté, clé ' +
      'refusée, extension absente ou site injoignable.',
  })
  async checkAll(@ActingUser() acting: CurrentUser) {
    const sites = await this.sites.findAll(acting);
    await this.plugins.checkAll(sites.map(({ id }) => id));
    return this.sites.findAll(acting);
  }

  @Post(':id/check')
  @ApiOperation({ summary: 'Vérifier l’extension WordPress d’un site' })
  async check(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    await this.sites.findOne(id, acting);
    await this.plugins.check(id);
    return this.sites.findOne(id, acting);
  }

  @Get()
  @ApiOperation({ summary: 'Les sites WordPress déclarés' })
  findAll(@ActingUser() acting: CurrentUser) {
    return this.sites.findAll(acting);
  }

  @Post()
  create(@Body() dto: CreateSiteDto, @ActingUser() acting: CurrentUser) {
    return this.sites.create(dto, acting);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier un site',
    description:
      'Une clé absente du corps laisse en place celle déjà enregistrée.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.sites.update(id, dto, acting);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un site sans article',
    description:
      'Un site qui porte des articles est refusé : le supprimer les ' +
      'emporterait, et avec eux les posts qui en sont nés. Le désactiver.',
  })
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.sites.remove(id, acting);
  }
}

/** Ce que l'extension interroge pour proposer une destination. Même clé que
 * les lots de publication, et aucune clé de site n'en ressort. */
@ApiTags('jobs')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('jobs/sites')
export class SiteTargetsController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @ApiOperation({ summary: 'Les sites où une reprise peut être déposée' })
  targets(@ActingUser() acting: CurrentUser | null) {
    return this.sites.targets(acting);
  }
}
