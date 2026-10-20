import { Body, Controller, Get, HttpCode, Module, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { IngestModule } from '../ingest/ingest.module';
import { WordpressModule } from '../wordpress/wordpress.module';
import { SiteRelayService } from './site-relay.service';

export class PauseSiteDto {
  /** Pourquoi : « limite » par défaut (publicité…). */
  @ApiPropertyOptional({ example: 'limite' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  /** Le site qui prend le relais. Absent : simple pause, les posts attendent. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  relaySiteId?: string;
}

@ApiTags('sites')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('sites/:id/relay')
export class SiteRelayController {
  constructor(private readonly relay: SiteRelayService) {}

  @Get()
  @ApiOperation({ summary: 'Pause et relais d’un site : copies, redirection' })
  detail(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.relay.detail(id, acting);
  }

  @Post('pause')
  @HttpCode(200)
  @ApiOperation({
    summary: '⏸ Mettre un site en pause (limite), avec ou sans relais',
    description:
      'Ses posts ne partent plus. Avec `relaySiteId`, ses articles sont copiés sur ce site (même slug), ' +
      'leurs posts en attente y sont déplacés, puis le site en pause redirige ses visiteurs vers lui (302).',
  })
  pause(@Param('id') id: string, @Body() dto: PauseSiteDto, @ActingUser() acting: CurrentUser) {
    return this.relay.pause(id, dto, acting);
  }

  @Post('resume')
  @HttpCode(200)
  @ApiOperation({ summary: '▶ Réactiver un site en pause : la redirection est retirée' })
  resume(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.relay.resume(id, acting);
  }

  @Post('retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Relancer les copies en erreur vers le relais' })
  retry(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.relay.retry(id, acting);
  }

  @Post('redirect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Poser la redirection vers le relais sans attendre la fin des copies' })
  redirect(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.relay.redirectNow(id, acting);
  }
}

/** ⏸ Un site limité, mis en pause, relayé par un autre. */
@Module({
  imports: [WordpressModule, IngestModule],
  controllers: [SiteRelayController],
  providers: [SiteRelayService],
})
export class SiteRelayModule {}
