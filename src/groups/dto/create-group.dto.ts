import { RecordStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateGroupDto {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsUrl({ require_tld: false })
  url!: string;
}
