import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Ce qu'un navigateur annonce en s'appairant seul. */
export class AutoPairDto {
  @ApiProperty({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  profileExternalId!: string;

  /** Le nom du profil dans NSTBrowser, pour un profil créé à l'occasion. */
  @ApiPropertyOptional({ example: 'Salim' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
