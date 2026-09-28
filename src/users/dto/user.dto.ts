import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { RecordStatus, Role } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'sofia' })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Le nom d’utilisateur n’accepte que lettres, chiffres, . _ -',
  })
  username!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional({ enum: Role, default: Role.MANAGER })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @ApiPropertyOptional({
    description: 'Clé NSTBrowser du compte. Chaîne vide = la retirer.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nstApiKey?: string;
}

/** Ce qu'un compte règle lui-même, sans passer par un administrateur. */
export class UpdateNstKeyDto {
  @ApiProperty({
    description:
      'Clé de l’API locale NSTBrowser (application → API). Chaîne vide = la retirer.',
  })
  @IsString()
  @MaxLength(200)
  nstApiKey!: string;
}
