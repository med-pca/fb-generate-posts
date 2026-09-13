import { RecordStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateProfileDto {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  defaultImageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minPostsPerJob = 2;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPostsPerJob = 6;
}
