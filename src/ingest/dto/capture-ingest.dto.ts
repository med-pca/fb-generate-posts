import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ValidateIf,
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
  /** Le texte de la publication. Facultatif en mode « news » : l'image suffit. */
  @ApiProperty({ description: 'Texte de la publication, tel quel' })
  @ValidateIf((dto: CaptureIngestDto) => dto.mode !== 'news')
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  caption!: string;

  /** L'image de la publication. Obligatoire en mode « news » : c'est elle
   * que l'article raconte. */
  @ApiPropertyOptional({ description: 'Image de la publication' })
  @ValidateIf((dto: CaptureIngestDto) => dto.mode === 'news' || dto.imageUrl !== undefined)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;
}
