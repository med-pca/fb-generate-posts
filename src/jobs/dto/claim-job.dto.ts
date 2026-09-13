import { IsString } from 'class-validator';

export class ClaimJobDto {
  @IsString()
  profileId!: string;

  @IsString()
  groupId!: string;
}
