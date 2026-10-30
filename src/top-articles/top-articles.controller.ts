import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { TopArticlesService } from './top-articles.service';

@ApiTags('top-articles')
@UseGuards(AdminAuthGuard)
@Controller('top-articles')
export class TopArticlesController {
  constructor(private readonly top: TopArticlesService) {}

  @Get()
  @ApiOperation({ summary: 'Les 10 articles concurrents du jour (Radar) : les siens, ou ceux de tous pour un admin' })
  list(@ActingUser() acting: CurrentUser | null) {
    return this.top.list(acting);
  }

  @Get('settings')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Réglages : nombre d’articles par jour, gestionnaires qui y ont accès (admin)' })
  settings() {
    return this.top.settings();
  }

  @Put('settings')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Régler le nombre d’articles par jour et les gestionnaires qui y ont accès (admin)' })
  updateSettings(@Body() body: { perUser?: number; enabledUserIds?: string[] }) {
    return this.top.updateSettings(body ?? {});
  }

  @Post('regenerate')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Refaire la distribution du jour (admin)' })
  regenerate() {
    return this.top.regenerate();
  }
}
