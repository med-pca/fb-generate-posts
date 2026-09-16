import { ApiProperty } from '@nestjs/swagger';
import {
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
}
