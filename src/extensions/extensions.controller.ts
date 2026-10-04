import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { isSecure } from '../auth/cookies';
import { ExtensionsService } from './extensions.service';

@ApiTags('extensions')
@UseGuards(AdminAuthGuard)
@Controller('extensions')
export class ExtensionsController {
  constructor(private readonly extensions: ExtensionsService) {}

  @Get()
  @ApiOperation({ summary: 'Nos extensions : version courante et historique de toutes les versions' })
  list() {
    return this.extensions.list();
  }

  @Get(':key/:version/download')
  @ApiOperation({ summary: 'Télécharger une version (préconfigurée avec la clé du compte si ?preset=1)' })
  async download(
    @Param('key') key: string,
    @Param('version') version: string,
    @Query('preset') preset: string | undefined,
    @ActingUser() acting: CurrentUser,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
    const origin = `${isSecure(request.headers) ? 'https' : 'http'}://${host}`;
    const { fileName, zip } = await this.extensions.download(key, version, { preset: preset === '1' || preset === 'true', origin }, acting);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .header('cache-control', 'no-store')
      .send(zip);
  }

  @Post('sync')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Relire le dossier extension/ et enregistrer les nouvelles versions (admin)' })
  sync() {
    return this.extensions.syncAll();
  }

  @Post(':key/pin')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Revenir à une version (ou { version: null } pour suivre la plus récente) (admin)' })
  pin(@Param('key') key: string, @Body() body: { version?: string | null }, @ActingUser() acting: CurrentUser) {
    return this.extensions.pin(key, body?.version ?? null, acting);
  }
}
