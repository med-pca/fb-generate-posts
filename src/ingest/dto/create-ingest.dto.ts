import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  ValidateIf,
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

  /** `rewrite` (défaut) : réécrire l'article de `sourceUrl`. `news` : créer
   * notre propre article depuis l'image, rapprochée de l'actualité — pas de
   * site source. */
  @ApiPropertyOptional({ enum: ['rewrite', 'news'], default: 'rewrite' })
  @IsOptional()
  @IsIn(['rewrite', 'news'])
  mode?: 'rewrite' | 'news';

  @ApiPropertyOptional({ example: 'https://exemple.com/article', description: 'Obligatoire, sauf en mode « news »' })
  @ValidateIf((dto: CreateIngestDto) => dto.mode !== 'news' || Boolean(dto.sourceUrl))
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Site WordPress de destination. Défaut : WORDPRESS_SITE_URL.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  siteUrl?: string;

  @ApiPropertyOptional({
    default: 'auto',
    description:
      '« auto » garde la langue de la page source. Une langue imposée fait ' +
      'traduire l’article au passage.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  language = 'auto';

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
