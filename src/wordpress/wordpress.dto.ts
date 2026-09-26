import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class WordpressArticleDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  siteUrl!: string;

  @IsString()
  @MaxLength(200)
  @IsNotEmpty()
  siteName!: string;

  @IsString()
  @Matches(/^[1-9]\d{0,19}$/)
  postId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  title!: string;

  @IsString()
  @MaxLength(100000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  excerpt?: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  articleUrl!: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;

  @IsDateString()
  publishedAt!: string;

  /** Posé par le plugin quand l'article vient d'une reprise : il rattache
   * l'article à sa fiche et fait porter aux posts la légende et l'image du
   * post d'origine, à la place de l'extrait automatique. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ingestRef?: string;
}
