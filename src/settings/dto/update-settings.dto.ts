import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSettingsDto {
  /** Le coupe-circuit de la publication : à false, aucun profil ne publie. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publishingEnabled?: boolean;

  /** L'objectif de publications par jour. 0 = pas d'objectif. */
  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  dailyTarget?: number;

  /** La plage sur laquelle l'objectif s'étale, en minutes depuis minuit. */
  @ApiPropertyOptional({ minimum: 0, maximum: 1439 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  objectiveStart?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  objectiveEnd?: number;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  objectiveTimezone?: string;
}
