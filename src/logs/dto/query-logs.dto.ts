import { Transform } from 'class-transformer';
import { LogLevel } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { LOG_DOMAIN_KEYS } from '../domains';
import type { LogDomain } from '../domains';

export class QueryLogsDto extends PaginationDto {
  /** Publication, captures, synchronisation, groupes, ou autres. */
  @IsOptional()
  @IsIn(LOG_DOMAIN_KEYS)
  domain?: LogDomain;

  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  profileId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @IsDateString()
  until?: string;

  /** Raccourci vers ce qui demande une décision : erreurs et réservations
   * perdues, sans le bruit des événements nominaux. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  onlyIncidents = false;
}
