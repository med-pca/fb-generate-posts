import { LogLevel } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLogDto {
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

  /** Le post Facebook concerné : filtrable et cliquable dans le journal. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  facebookUrl?: string;

  @IsString()
  eventType!: string;

  @IsOptional()
  @IsEnum(LogLevel)
  level: LogLevel = LogLevel.INFO;

  @IsString()
  message!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
