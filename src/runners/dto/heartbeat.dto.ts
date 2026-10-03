import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** L'état que l'extension rapporte. Tout est optionnel : un battement doit
 * passer même depuis une version plus ancienne de l'extension. */
export class HeartbeatDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  running?: boolean;

  @ApiPropertyOptional({ example: 'publication' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  published?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  failed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  links?: number;

  /** Qui parle : version de l'extension, navigateur. Pour reconnaître un
   * profil resté sur une vieille version. */
  @ApiPropertyOptional({ example: 'extension 1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  agent?: string;

  /** L'identifiant numérique du compte Facebook connecté dans ce navigateur
   * (cookie `c_user`). C'est ce qui désigne nos profils au vérificateur. */
  @ApiPropertyOptional({ example: '100089123456789' })
  @IsOptional()
  @Matches(/^\d{5,20}$/)
  facebookUserId?: string;

  @ApiPropertyOptional({ example: 'Rihab Nakous' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  facebookName?: string;
}
