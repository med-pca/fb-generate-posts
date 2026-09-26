import { JoinStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateJoinStatusDto {
  @IsEnum(JoinStatus)
  joinStatus!: JoinStatus;

  @IsOptional()
  @IsString()
  error?: string;
}
