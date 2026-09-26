import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** Les hôtes que Facebook sert : la reprise part d'une publication, pas
 * d'une page quelconque collée par erreur. */
const FACEBOOK_HOST =
  /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.watch)\//i;

export class CreateIngestDto {
  @ApiProperty({ example: 'https://www.facebook.com/exemple/posts/123' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  @Matches(FACEBOOK_HOST, {
    message: 'facebookUrl doit pointer vers une publication Facebook',
  })
  facebookUrl!: string;

  @ApiProperty({ example: 'https://exemple.com/article' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  sourceUrl!: string;

  @ApiPropertyOptional({
    description: 'Site WordPress de destination. Défaut : WORDPRESS_SITE_URL.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  siteUrl?: string;

  @ApiPropertyOptional({ default: 'fr' })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  language = 'fr';

  @ApiPropertyOptional({
    type: [String],
    description: 'Vide : tous les profils actifs.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profileIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Vide : tous les groupes actifs des profils retenus.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}
