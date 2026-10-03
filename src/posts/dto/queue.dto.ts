import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
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
