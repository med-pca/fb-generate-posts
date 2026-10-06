import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { LANGUAGES } from '../ingest/image-translator.service';
import { VisualsService } from './visuals.service';

/** Une image importée dans la plateforme. */
export class UploadVisualDto {
  /** L'image en base64 (sans le préfixe data:). 10 Mo au plus. */
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(14_000_000) imageData!: string;
  @ApiProperty({ example: 'image/jpeg' }) @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif']) mimeType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  /** Vide : écrite par l'IA dans la langue choisie. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) caption?: string;
  @ApiPropertyOptional({ example: 'fr' }) @IsOptional() @ValidateIf((_d, v) => v !== null) @IsIn(Object.keys(LANGUAGES)) language?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) groupIds?: string[];
  /** Traduire le texte de l'image dans la langue choisie. */
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() translate?: boolean;
  /** Créer tout de suite le post vers les groupes visés. */
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() createPosts?: boolean;
}

export class VisualPostsDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) groupIds?: string[];
}

export class UpdateVisualDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) caption?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsIn(Object.keys(LANGUAGES)) language?: string | null;
}

export class VisualQueryDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z]{2}$/) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
}

/** Rubrique Articles → Visuels : des images seules, publiées avec leur
 * description, sans article ni lien. */
@ApiTags('visuals')
@UseGuards(AdminAuthGuard)
@Controller('visuals')
export class VisualsController {
  constructor(private readonly visuals: VisualsService) {}

  @Get()
  list(@Query() q: VisualQueryDto, @ActingUser() acting: CurrentUser) {
    return this.visuals.list(q, acting);
  }

  @Post()
  @ApiOperation({ summary: 'Importer notre propre image : traduction de son texte et description par l’IA au choix, post vers les groupes' })
  upload(@Body() dto: UploadVisualDto, @ActingUser() acting: CurrentUser) {
    return this.visuals.create(
      {
        image: { data: dto.imageData.replace(/^data:[^;]+;base64,/, ''), mimeType: dto.mimeType },
        language: dto.language ?? null,
        translate: Boolean(dto.translate),
        caption: dto.caption,
        title: dto.title,
        categoryId: dto.categoryId ?? null,
        groupIds: dto.groupIds,
        createPosts: dto.createPosts !== false,
        origin: 'upload',
      },
      acting,
    );
  }

  @Post(':id/posts')
  @ApiOperation({ summary: 'Créer les posts d’un visuel vers les groupes (choisis, ou de sa langue et sa catégorie)' })
  posts(@Param('id') id: string, @Body() dto: VisualPostsDto, @ActingUser() acting: CurrentUser) {
    return this.visuals.createPosts(id, dto, acting);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVisualDto, @ActingUser() acting: CurrentUser) {
    return this.visuals.update(id, dto, acting);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.visuals.remove(id, acting);
  }
}
