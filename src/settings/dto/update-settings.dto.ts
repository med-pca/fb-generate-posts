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
import { REPEAT_LIMITS } from '../../posts/repeat.service';

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

  /** La duplication par défaut : combien de fois chaque post part dans un
   * même groupe (1 = une seule fois), et l'écart entre deux, en heures. */
  @ApiPropertyOptional({ minimum: 1, maximum: REPEAT_LIMITS.maxTimes })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(REPEAT_LIMITS.maxTimes)
  repeatTimes?: number;

  @ApiPropertyOptional({ minimum: REPEAT_LIMITS.minHours, maximum: REPEAT_LIMITS.maxHours })
  @IsOptional()
  @IsInt()
  @Min(REPEAT_LIMITS.minHours)
  @Max(REPEAT_LIMITS.maxHours)
  repeatEveryHours?: number;
}
