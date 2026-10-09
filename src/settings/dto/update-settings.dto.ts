import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
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

  /** Jours de pause d'un profil limité par Facebook. */
  @ApiPropertyOptional({ minimum: 1, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  rateLimitPauseDays?: number;

  /** `article` : un article dans tous ses groupes, puis le suivant.
   * `group` : des lots de plusieurs posts par groupe. */
  @ApiPropertyOptional({ enum: ['article', 'group'] })
  @IsOptional()
  @IsIn(['article', 'group'])
  pilotMode?: 'article' | 'group';

  /** Accélérer automatiquement pour tenir l'objectif. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  adaptivePacing?: boolean;

  /** Minutes minimum entre deux posts d'un même profil. */
  @ApiPropertyOptional({ minimum: 2, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(120)
  minPostGapMinutes?: number;

  /** « Page suivante » tous les N paragraphes (0 = un seul tenant). */
  @ApiPropertyOptional({ minimum: 0, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  articleParagraphsPerPage?: number;

  /** Pages au plus par article. */
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  articleMaxPages?: number;

  /** Mots minimum par page. */
  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  articleMinWordsPerPage?: number;

  /** L'IA qui traduit le texte d'une image (mode « engagement »). */
  @ApiPropertyOptional({ enum: ['auto', 'openai', 'qwen', 'seedream'] })
  @IsOptional()
  @IsIn(['auto', 'openai', 'qwen', 'seedream'])
  imageProvider?: string;
}
