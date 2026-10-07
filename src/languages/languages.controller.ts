import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { LanguagesService } from './languages.service';

export class CreateLanguageDto {
  @ApiPropertyOptional({ example: 'sv' }) @IsString() @IsNotEmpty() code!: string;
  /** En anglais : c'est ce nom qui part dans les consignes de l'IA. */
  @ApiPropertyOptional({ example: 'Swedish' }) @IsString() @IsNotEmpty() name!: string;
}
export class UpdateLanguageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
}

@ApiTags('languages')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('languages')
export class LanguagesController {
  constructor(private readonly languages: LanguagesService) {}

  @Get()
  @ApiOperation({ summary: 'Les langues (code ISO + nom en anglais), avec leur usage' })
  list() {
    return this.languages.list();
  }

  @Post()
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Ajouter une langue' })
  create(@Body() dto: CreateLanguageDto, @ActingUser() acting: CurrentUser) {
    return this.languages.create(dto, acting);
  }

  @Patch(':code')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Renommer une langue ou changer son code (les groupes suivent)' })
  update(@Param('code') code: string, @Body() dto: UpdateLanguageDto, @ActingUser() acting: CurrentUser) {
    return this.languages.update(code, dto, acting);
  }

  @Delete(':code')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Supprimer une langue (refusé si utilisée, sauf ?detach=true)' })
  remove(@Param('code') code: string, @Query('detach') detach: string | undefined, @ActingUser() acting: CurrentUser) {
    return this.languages.remove(code, detach === 'true', acting);
  }
}
