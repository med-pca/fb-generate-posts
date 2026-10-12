import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';

/** Lier (ou délier) plusieurs profils à plusieurs groupes, d'un coup. */
export class BulkLinkDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  profileIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3000)
  @IsString({ each: true })
  groupIds!: string[];

  @ApiProperty({ enum: ['link', 'unlink'] })
  @IsIn(['link', 'unlink'])
  action!: 'link' | 'unlink';
}

/** Partager (ou retirer) plusieurs groupes ou sites avec plusieurs comptes. */
export class BulkShareDto {
  @ApiProperty({ enum: ['groups', 'sites'] })
  @IsIn(['groups', 'sites'])
  kind!: 'groups' | 'sites';

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3000)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty({ enum: ['grant', 'revoke'] })
  @IsIn(['grant', 'revoke'])
  action!: 'grant' | 'revoke';
}

export class OptionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}

/** Corriger à la main l'adhésion et la pré-approbation de plusieurs profils
 * dans plusieurs groupes (ce qu'on a fait soi-même sur Facebook). */
export class BulkMembershipDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsString({ each: true }) profileIds!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @IsString({ each: true }) groupIds!: string[];
  /** Le nouvel état d'adhésion (absent = inchangé). */
  @IsOptional() @IsIn(['JOINED', 'REQUESTED', 'QUESTIONS', 'NOT_JOINED']) joinStatus?: 'JOINED' | 'REQUESTED' | 'QUESTIONS' | 'NOT_JOINED';
  /** true = pré-approuvé (déjà fait à la main, il devient aussi « rejoint ») ;
   * false = retirer la pré-approbation ; absent = inchangé. */
  @IsOptional() @IsBoolean() preApproved?: boolean;
  /** Lier d'abord les couples qui ne le sont pas encore. */
  @IsOptional() @IsBoolean() linkMissing?: boolean;
}
