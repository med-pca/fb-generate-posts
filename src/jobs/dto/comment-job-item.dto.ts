import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CommentJobItemDto {
  /** Sans cet identifiant, le commentaire ne pourra jamais être retrouvé pour
   * y placer l'URL : il est donc obligatoire. */
  @ApiProperty({ description: 'Identifiant ou URL du commentaire créé' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  commentExternalId!: string;

  @IsOptional()
  @IsDateString()
  commentedAt?: string;

  /** Le commentaire enregistré a disparu (souris bougée, saisie perdue) :
   * l'extension en a posé un nouveau, qui le remplace — tant que le lien
   * n'a pas encore été posé. */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
