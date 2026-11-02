import { Body, Controller, Get, HttpCode, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { PerfService } from './perf.service';

class PerfSettingsDto {
  @ApiPropertyOptional() @IsBoolean() enabled!: boolean;
}

@ApiTags('performance')
@UseGuards(AdminAuthGuard, AdminRoleGuard)
@Controller('admin/perf')
export class PerfController {
  constructor(private readonly perf: PerfService) {}

  @Get()
  @ApiOperation({ summary: '📈 Performance de l’API sur les N dernières heures : routes lentes, coût, SQL, appelants, candidats au cache, appels lents (admin)' })
  report(@Query('hours') hours?: string) {
    return this.perf.report(Number(hours) || 24);
  }

  @Put('settings')
  @HttpCode(200)
  @ApiOperation({ summary: 'Couper ou reprendre la mesure (admin)' })
  settings(@Body() dto: PerfSettingsDto) {
    return this.perf.setEnabled(dto.enabled);
  }
}
