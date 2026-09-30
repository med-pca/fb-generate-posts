import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LOG_DOMAIN_KEYS } from '../domains';
import type { LogDomain } from '../domains';

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

  /** Les compteurs, la répartition et les incidents d'un seul domaine. Les
   * totaux par domaine (`domains`) restent calculés sur tous, pour les
   * onglets. */
  @IsOptional()
  @IsIn(LOG_DOMAIN_KEYS)
  domain?: LogDomain;
}
