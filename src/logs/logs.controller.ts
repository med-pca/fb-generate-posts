import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
import { CreateLogDto } from './dto/create-log.dto';
import { QueryLogsDto } from './dto/query-logs.dto';
import { LogsSummaryDto } from './dto/logs-summary.dto';
import { LogsService } from './logs.service';

@ApiTags('logs')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Post()
  create(@Body() dto: CreateLogDto) {
    return this.logs.create(dto);
  }

  @Get()
  findAll(
    @ActingUser() acting: CurrentUser | null,
    @Query('profileId') profileId?: string,
  ) {
    return this.logs.findAll(profileId, acting);
  }
}

/** Lecture côté administration : la clé d'automatisation n'a pas à circuler
 * dans le navigateur pour consulter ce que les automates ont écrit. */
@ApiTags('logs')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/logs')
export class LogsAdminController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Journaux filtrés et paginés (niveau, événement, profil, groupe, post, job, période, recherche)',
  })
  search(@Query() query: QueryLogsDto, @ActingUser() acting: CurrentUser) {
    return this.logs.search(query, acting);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Synthèse décisionnelle : volumes par niveau, événements dominants, profils en échec, incidents ouverts',
  })
  summary(@Query() query: LogsSummaryDto, @ActingUser() acting: CurrentUser) {
    return this.logs.summary(query, acting);
  }
}
