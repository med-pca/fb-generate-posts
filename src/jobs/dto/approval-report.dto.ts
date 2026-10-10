import { IsIn, IsOptional, IsUrl } from 'class-validator';

/** Ce que le profil a vu en revenant dans le groupe. */
export class ApprovalReportDto {
  /** `approved` : le post est visible ; `pending` : toujours en attente. */
  @IsIn(['approved', 'pending'])
  outcome!: 'approved' | 'pending';

  /** L'adresse du post, une fois visible. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  externalPostUrl?: string;
}
