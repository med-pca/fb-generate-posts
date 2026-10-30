import { ApiPropertyOptional } from '@nestjs/swagger';
import { RecordStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  ValidateIf,
  Max,
  Min,
} from 'class-validator';

export class CreateProfileDto {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  defaultImageUrl?: string;

  /** Le lien de son profil Facebook, pour le reconnaître. Vide = effacé. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i, { message: 'Lien Facebook attendu (https://www.facebook.com/…)' })
  facebookProfileUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minPostsPerJob = 2;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPostsPerJob = 6;

  /** Seuil d'alimentation propre au profil. `null` ou absent : le profil suit
   * le réglage global d'automation_settings. */
  @ApiPropertyOptional({ minimum: 1, maximum: 1000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  minimumAvailable?: number | null;

  /** Idem, appliqué à chacun des groupes du profil. */
  @ApiPropertyOptional({ minimum: 1, maximum: 1000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  minimumAvailablePerGroup?: number | null;
}
