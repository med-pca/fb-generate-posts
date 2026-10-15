import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** Régler une IA d'image depuis la plateforme. Champ absent = inchangé. */
export class ImageProviderDto {
  /** La clé d'API ; jamais renvoyée ensuite (seulement ses 4 derniers caractères). */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
  /** Effacer la clé saisie ici (retour à celle du serveur, s'il en a une). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clearKey?: boolean;
  /** Vide = le modèle par défaut. */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsString() @MaxLength(120) model?: string | null;
  /** Vide = l'adresse par défaut (région de la clé). */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_d, v) => v !== null) @IsString() @MaxLength(300) baseUrl?: string | null;
}
