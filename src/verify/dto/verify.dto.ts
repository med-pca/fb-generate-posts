import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { VERIFY_OUTCOMES } from '../verify.service';
import { MEMBER_KINDS, MEMBER_OUTCOMES } from '../members.service';
import { AUDIT_OUTCOMES } from '../audit.service';
import type { AuditOutcome } from '../audit.service';
import type { MemberKind, MemberOutcome } from '../members.service';
import type { VerifyOutcome } from '../verify.service';

/** Le vérificateur demande un lot de publications à contrôler. */
export class VerifyClaimDto {
  @ApiProperty({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  profileExternalId!: string;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/** Ce que le vérificateur a vu sur la page du post. */
export class VerifyResultDto {
  @ApiProperty({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  profileExternalId!: string;

  @ApiProperty({ enum: VERIFY_OUTCOMES })
  @IsIn(VERIFY_OUTCOMES as unknown as string[])
  outcome!: VerifyOutcome;

  @ApiPropertyOptional({ example: 'commentaire « . » sans URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;

  /** L'adresse du post, retrouvée dans le groupe quand la tâche n'en avait pas. */
  @ApiPropertyOptional({ example: 'https://www.facebook.com/groups/123/posts/456' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  postUrl?: string;

  /** Le post sans lien a bien été supprimé par le vérificateur. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

export class ModeratorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isModerator?: boolean;

  /** L'identifiant Facebook numérique du profil, saisi à la main quand
   * l'extension de publication ne l'a pas encore remonté. Vide = l'effacer. */
  @ApiPropertyOptional({ example: '100089123456789' })
  @IsOptional()
  @Matches(/^(\d{5,20})?$/)
  facebookUserId?: string;
}

/** Ce que le vérificateur a fait pour un de nos profils dans un groupe. */
export class MemberResultDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  profileExternalId!: string;

  @ApiProperty({ enum: MEMBER_KINDS })
  @IsIn(MEMBER_KINDS as unknown as string[])
  kind!: MemberKind;

  @ApiProperty({ enum: MEMBER_OUTCOMES })
  @IsIn(MEMBER_OUTCOMES as unknown as string[])
  outcome!: MemberOutcome;

  /** L'identifiant du compte sur lequel l'extension a agi : il doit être
   * celui du profil, sinon le rapport est refusé. */
  @ApiProperty({ example: '100089123456789' })
  @Matches(/^\d{5,20}$/)
  facebookUserId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}

export class ResolveDto {
  @ApiProperty({ enum: ['ok', 'republish'] })
  @IsIn(['ok', 'republish'])
  action!: 'ok' | 'republish';
}

/** Le constat d'un contrôle de pré-approbation. */
export class AuditResultDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  profileExternalId!: string;

  @ApiProperty({ enum: AUDIT_OUTCOMES })
  @IsIn(AUDIT_OUTCOMES as unknown as string[])
  outcome!: AuditOutcome;

  @ApiProperty({ example: '100089123456789' })
  @Matches(/^\d{5,20}$/)
  facebookUserId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}

/** Demander un contrôle : `check` (regarder) ou `fix` (regarder puis corriger). */
export class AuditRequestDto {
  @ApiProperty({ enum: ['check', 'fix'] })
  @IsIn(['check', 'fix'])
  mode!: 'check' | 'fix';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  profileGroupIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profileId?: string;
}

/** L'admin demande au modérateur d'accepter les adhésions, ou de pré-approuver. */
/** Marquer à la main ce qui a été fait directement sur Facebook. */
export class MemberManualDto {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  profileGroupIds!: string[];

  /** `preapproved` : fait à la main ; `clear` : annuler ce marquage. */
  @ApiProperty({ enum: ['preapproved', 'clear'] })
  @IsIn(['preapproved', 'clear'])
  state!: 'preapproved' | 'clear';
}

export class MemberRequestDto {
  @ApiProperty({ enum: MEMBER_KINDS })
  @IsIn(MEMBER_KINDS as unknown as string[])
  kind!: MemberKind;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  profileGroupIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profileId?: string;
}
