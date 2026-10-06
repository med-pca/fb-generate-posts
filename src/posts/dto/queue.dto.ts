import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Ce que la file montre : filtrée par catégorie ou par groupe. */
export class QueueQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupId?: string;

  /** Combien de prochaines publications montrer. */
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  /** Combien de publications déjà faites montrer. */
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  publishedLimit = 20;
}

export const PRIORITY_MOVES = ['top', 'up', 'down', 'reset'] as const;
export type PriorityMove = (typeof PRIORITY_MOVES)[number];

/** Déplacer un post dans la file : un geste (`move`), ou une valeur. */
export class PriorityDto {
  @ApiPropertyOptional({ enum: PRIORITY_MOVES })
  @IsOptional()
  @IsIn(PRIORITY_MOVES)
  move?: PriorityMove;

  @ApiPropertyOptional({ minimum: -1000, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;
}

/** Envoyer une cible par un profil précis. `null` rend la cible à la file. */
export class ForceTargetDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((dto: ForceTargetDto) => dto.profileId !== null)
  @IsString()
  profileId!: string | null;
}

/** L'adresse d'un post Facebook publié. */
export class FacebookUrlDto {
  @ApiProperty({ example: 'https://www.facebook.com/groups/123/posts/456' })
  @IsString()
  @MaxLength(2000)
  facebookUrl!: string;
}

export class OptionalFacebookUrlDto {
  @ApiPropertyOptional({ example: 'https://www.facebook.com/groups/123/posts/456' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  facebookUrl?: string;
}

export const PUBLISHED_VERIFY = ['ok', 'republished', 'needs_action', 'unverified'] as const;
export const PUBLISHED_LINK = ['placed', 'waiting', 'missing', 'none'] as const;

/** L'audit des publications faites : une période (date ET heure), et de quoi
 * la découper. Les totaux portent sur TOUT le filtre, la liste est paginée. */
export class PublishedQueryDto {
  /** Début de la période (inclus), date-heure ISO. */
  @ApiPropertyOptional({ example: '2026-10-05T08:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Fin de la période (exclue), date-heure ISO. */
  @ApiPropertyOptional({ example: '2026-10-05T20:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() profileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() groupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  @ApiPropertyOptional({ enum: PUBLISHED_VERIFY })
  @IsOptional()
  @IsIn(PUBLISHED_VERIFY)
  verify?: (typeof PUBLISHED_VERIFY)[number];

  @ApiPropertyOptional({ enum: PUBLISHED_LINK })
  @IsOptional()
  @IsIn(PUBLISHED_LINK)
  link?: (typeof PUBLISHED_LINK)[number];

  /** Avec ou sans l'adresse du post Facebook. */
  @ApiPropertyOptional({ enum: ['with', 'without'] })
  @IsOptional()
  @IsIn(['with', 'without'])
  url?: 'with' | 'without';

  /** Dans le titre ou le texte du post. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit = 50;
}

/** Les règles d'un groupe : plafond par jour, heures de publication. */
export class GroupLimitsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1000, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(1000)
  dailyCap?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(1439)
  hoursStart?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(1439)
  hoursEnd?: number | null;
}
