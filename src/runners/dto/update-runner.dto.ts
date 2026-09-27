import { ApiPropertyOptional } from '@nestjs/swagger';
import { RunnerMode } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Ce que l'admin règle sur un profil. Tout est optionnel : un interrupteur
 * se bascule sans renvoyer la fenêtre horaire avec. */
export class UpdateRunnerDto {
  @ApiPropertyOptional({ enum: RunnerMode })
  @IsOptional()
  @IsEnum(RunnerMode)
  mode?: RunnerMode;

  /** Minutes depuis minuit, 0 à 1439. `null` enlève la borne. */
  @ApiPropertyOptional({ minimum: 0, maximum: 1439, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  windowStart?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  windowEnd?: number | null;

  /** Jours ISO, « 1,2,3,4,5 ». Vide = tous les jours. */
  @ApiPropertyOptional({ example: '1,2,3,4,5' })
  @IsOptional()
  @IsString()
  @Matches(/^$|^[1-7](,[1-7])*$/, {
    message: 'days doit être des jours ISO séparés par des virgules, ex. 1,2,3,4,5',
  })
  days?: string;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /** Réglages poussés au navigateur. Le contenu n'est pas validé ici : c'est
   * l'extension qui ne retient que les clés qu'elle connaît, sans quoi ajouter
   * un réglage demanderait de modifier l'API aussi. */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown> | null;
}
