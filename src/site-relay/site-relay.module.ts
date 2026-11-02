import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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

export class CopyArticlesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  articleIds!: string[];

  /** Le site qui reçoit les copies. */
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  targetSiteId!: string;

  /** `new` (défaut) : de nouveaux posts pour le site cible ; `move` : les
   * posts en attente de l'original passent sur la copie. */
  @ApiPropertyOptional({ enum: ['new', 'move'] })
  @IsOptional()
  @IsIn(['new', 'move'])
  posts?: 'new' | 'move';
}

@ApiTags('articles')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('article-copies')
export class ArticleCopiesController {
  constructor(private readonly relay: SiteRelayService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: '📋 Copier des articles vers un autre site (même slug), avec de nouveaux posts ou en y déplaçant les posts en attente',
  })
  copy(@Body() dto: CopyArticlesDto, @ActingUser() acting: CurrentUser) {
    return this.relay.copyArticles(dto, acting);
  }

  @Get()
  @ApiOperation({ summary: 'Où en sont des copies : ?ids=a,b,c' })
  status(@Query('ids') ids: string | undefined, @ActingUser() acting: CurrentUser) {
    return this.relay.copies(String(ids ?? '').split(',').map((x) => x.trim()).filter(Boolean), acting);
  }
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
  controllers: [SiteRelayController, ArticleCopiesController],
  providers: [SiteRelayService],
})
export class SiteRelayModule {}
