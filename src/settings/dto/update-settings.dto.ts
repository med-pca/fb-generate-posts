import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  /** Le coupe-circuit de la publication : à false, aucun profil ne publie. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publishingEnabled?: boolean;
}
