import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** Ce que l'extension rapporte de la publication d'origine. En attendant
 * qu'elle le fasse, un administrateur le dépose à la main. */
export class ScrapeResultDto {
  @ApiProperty({ description: 'Texte de la publication d’origine' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  caption!: string;

  @ApiPropertyOptional({
    description:
      'Image de la publication. Absente, le post reprendra l’image par défaut du profil.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;
}
