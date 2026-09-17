import { ApiPropertyOptional } from '@nestjs/swagger';
import { RecordStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
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
