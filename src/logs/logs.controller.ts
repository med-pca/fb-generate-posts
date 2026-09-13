import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateLogDto } from './dto/create-log.dto';
import { LogsService } from './logs.service';

@ApiTags('logs')
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
