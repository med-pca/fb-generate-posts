import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { FastifyReply } from 'fastify';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { AnalyticsService } from './analytics.service';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Date (AAAA-MM-JJ) ou date-heure ISO' }) @IsOptional() @IsString() @MaxLength(40) from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() siteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() campaignId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() groupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() profileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() articleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) tz?: string;
}

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Chiffres clés, courbe, classements, heures et échecs, selon les filtres' })
  report(@Query() q: AnalyticsQueryDto, @ActingUser() acting: CurrentUser) {
    return this.analytics.report(q, acting);
  }

  @Get('export.csv')
  @ApiOperation({ summary: 'Les publications de la période, en CSV (Excel)' })
  async csv(@Query() q: AnalyticsQueryDto, @ActingUser() acting: CurrentUser, @Res() reply: FastifyReply) {
    const body = await this.analytics.csv(q, acting);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="analyse-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(body);
  }
}
