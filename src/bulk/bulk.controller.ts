import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { BulkLinkDto, BulkShareDto, OptionsQueryDto } from './bulk.dto';
import { BulkService } from './bulk.service';

@ApiTags('bulk')
@UseGuards(AdminAuthGuard)
@Controller('bulk')
export class BulkController {
  constructor(private readonly bulk: BulkService) {}

  @Get('groups')
  @ApiOperation({ summary: 'Tous les groupes visibles (léger), pour cocher en masse' })
  groups(@Query() query: OptionsQueryDto, @ActingUser() acting: CurrentUser) {
    return this.bulk.groupOptions(query, acting);
  }

  @Get('profiles')
  @ApiOperation({ summary: 'Tous les profils visibles (léger), pour cocher en masse' })
  profiles(@Query() query: OptionsQueryDto, @ActingUser() acting: CurrentUser) {
    return this.bulk.profileOptions(query, acting);
  }

  @Post('link')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lier ou délier plusieurs profils à plusieurs groupes' })
  link(@Body() dto: BulkLinkDto, @ActingUser() acting: CurrentUser) {
    return this.bulk.link(dto, acting);
  }

  @Post('share')
  @HttpCode(200)
  @ApiOperation({ summary: 'Partager ou retirer plusieurs groupes / sites avec plusieurs comptes' })
  share(@Body() dto: BulkShareDto, @ActingUser() acting: CurrentUser) {
    return this.bulk.share(dto, acting);
  }
}
