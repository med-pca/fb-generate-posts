import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Filtrer et trier les profils. */
export class QueryProfilesDto extends PaginationDto {
  /** Nom, identifiant NSTBrowser ou identifiant Facebook. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  /** Santé sur 14 jours ; `deactivate` = ceux qu'il vaudrait mieux désactiver. */
  @ApiPropertyOptional({ enum: ['good', 'watch', 'bad', 'new', 'deactivate'] })
  @IsOptional()
  @IsIn(['good', 'watch', 'bad', 'new', 'deactivate'])
  health?: 'good' | 'watch' | 'bad' | 'new' | 'deactivate';

  /** Pilotage : en marche (AUTO/ON) ou arrêté. */
  @ApiPropertyOptional({ enum: ['running', 'off'] })
  @IsOptional()
  @IsIn(['running', 'off'])
  activity?: 'running' | 'off';

  /** Profils membres d'un groupe de cette catégorie. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** Inclure les modérateurs (listes de filtres) ; par défaut, ils sont à part. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  withModerators?: boolean;

  @ApiPropertyOptional({ enum: ['recent', 'name', 'score', 'failures', 'published'] })
  @IsOptional()
  @IsIn(['recent', 'name', 'score', 'failures', 'published'])
  sort?: 'recent' | 'name' | 'score' | 'failures' | 'published';
}

export class DeactivateProfileDto {
  /** Le profil qui reprend ses posts en attente ; null = les rendre à la file. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transferTo?: string | null;
}
