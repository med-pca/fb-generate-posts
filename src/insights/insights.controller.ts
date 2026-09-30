import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { InsightsService } from './insights.service';
import { RESET_CONFIRMATION, ResetService } from './reset.service';

class ResetDto {
  @IsOptional()
  @IsString()
  confirm?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

@ApiTags('insights')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('counters')
  @ApiOperation({ summary: 'Les compteurs du menu' })
  counters(@ActingUser() acting: CurrentUser) {
    return this.insights.counters(acting);
  }

  @Get('profiles')
  @ApiOperation({
    summary: 'Statistiques de chaque profil',
    description:
      'Publications du jour, de la semaine, au total ; échecs ; groupes ' +
      'rejoints ou en attente ; stock qui l’attend.',
  })
  profiles(@ActingUser() acting: CurrentUser) {
    return this.insights.profileStats(acting);
  }

  @Get('objective')
  @ApiOperation({
    summary: 'L’objectif du jour, en temps réel',
    description:
      'Où l’on en est par rapport à l’objectif et à l’heure, le stock prêt, ' +
      'les articles à importer, la répartition par catégorie, groupe et profil.',
  })
  objective(@ActingUser() acting: CurrentUser) {
    return this.insights.objective(acting);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard, AdminRoleGuard)
@Controller('admin/reset')
export class ResetController {
  constructor(private readonly resets: ResetService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Tout effacer : posts, articles et lots (ADMIN)',
    description:
      `\`dryRun: true\` compte sans rien toucher. Sinon \`confirm: "${RESET_CONFIRMATION}"\` ` +
      'est exigé ; refusé tant qu’un lot est en cours, sauf `force: true`. ' +
      'Profils, groupes, catégories, sites, comptes et journaux restent.',
  })
  reset(@Body() dto: ResetDto, @ActingUser() acting: CurrentUser) {
    return this.resets.reset(dto, acting);
  }
}
