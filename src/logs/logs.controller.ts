import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { CreateLogDto } from './dto/create-log.dto';
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
  findAll(@Query('profileId') profileId?: string) {
    return this.logs.findAll(profileId);
  }
}
