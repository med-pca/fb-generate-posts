import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { ImportJsonDto } from './dto/import-json.dto';
import { ImportsService } from './imports.service';

@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('json-data')
  importJson(@Body() dto: ImportJsonDto, @ActingUser() acting: CurrentUser) {
    return this.imports.importJson(dto, acting);
  }
}
