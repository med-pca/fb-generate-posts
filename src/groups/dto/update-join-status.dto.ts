import { JoinStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateJoinStatusDto {
  @IsEnum(JoinStatus)
  joinStatus!: JoinStatus;

  @IsOptional()
  @IsString()
  error?: string;
}

/** Ce que l'admin fixe à la main. */
export class SetJoinStatusDto {
  @IsEnum(JoinStatus)
  joinStatus!: JoinStatus;
}
