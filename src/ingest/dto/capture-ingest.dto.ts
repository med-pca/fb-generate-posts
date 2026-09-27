import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CreateIngestDto } from './create-ingest.dto';

/** Tout ce que l'extension envoie en une fois : ce qu'elle a relevé sur la
 * publication, et l'adresse de l'article à réécrire. Un seul appel, parce
 * qu'elle agit sur décision de l'utilisateur, pas en tâche de fond. */
export class CaptureIngestDto extends CreateIngestDto {
  @ApiProperty({ description: 'Texte de la publication, tel quel' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  caption!: string;

  @ApiPropertyOptional({ description: 'Image de la publication' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;
}
