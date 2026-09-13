import { IsDateString, IsOptional, IsUrl } from 'class-validator';

export class PublishJobItemDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  externalPostUrl?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
