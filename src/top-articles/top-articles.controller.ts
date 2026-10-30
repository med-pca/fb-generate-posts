import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
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

  @Post('regenerate')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Refaire la distribution du jour (admin)' })
  regenerate() {
    return this.top.regenerate();
  }
}
