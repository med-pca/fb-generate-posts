import { IsBoolean, IsDateString, IsOptional, IsUrl } from 'class-validator';

export class PublishJobItemDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  externalPostUrl?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  /** Soumis mais en attente de validation par un administrateur du groupe. */
  @IsOptional()
  @IsBoolean()
  pendingApproval?: boolean;
}
