import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class LogsSummaryDto {
  /** Fenêtre d'observation, en heures (30 jours au maximum). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  hours = 24;

  @IsOptional()
  @IsString()
  profileId?: string;
}
