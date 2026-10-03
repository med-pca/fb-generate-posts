import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VERIFY_OUTCOMES } from '../verify.service';
import { MEMBER_KINDS, MEMBER_OUTCOMES } from '../members.service';
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
