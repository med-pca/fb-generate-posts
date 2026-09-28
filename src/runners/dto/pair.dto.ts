import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/** Le code collé dans l'extension. Rien d'autre : il porte à lui seul
 * l'identité du profil, donc l'opérateur n'a pas non plus à la choisir. */
export class PairDto {
  @ApiProperty({ example: 'K7F2QMJH' })
  @IsString()
  @Length(6, 16)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'Le code ne contient que des lettres et des chiffres',
  })
  code!: string;
}
