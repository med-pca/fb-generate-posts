import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  /** Le site : obligatoire. */
  @ApiProperty() @IsString() siteId!: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsString() categoryId?: string | null;
  @ApiProperty({ enum: ['day', 'week', 'month'] }) @IsIn(['day', 'week', 'month']) period!: 'day' | 'week' | 'month';
  @ApiProperty() @IsInt() @Min(1) @Max(1_000_000) target!: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1439) windowStart?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1439) windowEnd?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) groupIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) profileIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) articleIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /** Facultatif : au plus N publications par jour et par profil (null = sans plafond). */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsInt() @Min(1) @Max(1000) maxPerProfilePerDay?: number | null;
  /** Facultatif : la rotation — les équipes (groupes NSTBrowser), une par jour, dans l'ordre. */
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(200, { each: true }) rotationTeams?: string[];
}

export class UpdateCampaignDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() siteId?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsString() categoryId?: string | null;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'ENDED'] }) @IsOptional() @IsIn(['ACTIVE', 'PAUSED', 'ENDED']) status?: 'ACTIVE' | 'PAUSED' | 'ENDED';
  @ApiPropertyOptional({ enum: ['day', 'week', 'month'] }) @IsOptional() @IsIn(['day', 'week', 'month']) period?: 'day' | 'week' | 'month';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1_000_000) target?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1439) windowStart?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1439) windowEnd?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) groupIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) profileIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) articleIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /** Facultatif : au plus N publications par jour et par profil (null = sans plafond). */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsInt() @Min(1) @Max(1000) maxPerProfilePerDay?: number | null;
  /** Facultatif : la rotation — les équipes (groupes NSTBrowser), une par jour, dans l'ordre. */
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(200, { each: true }) rotationTeams?: string[];
}
