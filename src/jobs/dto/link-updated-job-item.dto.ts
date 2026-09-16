import { IsDateString, IsOptional } from 'class-validator';

export class LinkUpdatedJobItemDto {
  @IsOptional()
  @IsDateString()
  linkUpdatedAt?: string;
}
