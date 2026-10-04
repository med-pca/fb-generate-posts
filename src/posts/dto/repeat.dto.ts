import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { REPEAT_LIMITS } from '../repeat.service';

/** La règle de duplication d'un post. `null` = revenir au réglage global. */
export class RepeatRuleDto {
  /** Combien de fois il part dans chaque groupe (1 = une seule fois). */
  @ApiPropertyOptional({ minimum: 1, maximum: REPEAT_LIMITS.maxTimes, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(REPEAT_LIMITS.maxTimes)
  repeatTimes?: number | null;

  /** L'écart entre deux publications dans un même groupe, en heures. */
  @ApiPropertyOptional({ minimum: REPEAT_LIMITS.minHours, maximum: REPEAT_LIMITS.maxHours, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(REPEAT_LIMITS.minHours)
  @Max(REPEAT_LIMITS.maxHours)
  repeatEveryHours?: number | null;
}

export class BulkRepeatDto extends RepeatRuleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}
