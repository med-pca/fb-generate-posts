import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean()
  autoReplenishEnabled!: boolean;

  /** Le coupe-circuit de la publication. Sans valeur, l'état actuel est
   * conservé : un enregistrement des seuils ne doit pas rallumer ce qu'on
   * venait de couper. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publishingEnabled?: boolean;

  @IsInt()
  @Min(1)
  @Max(1000)
  minimumAvailablePerProfile!: number;

  /** Sans valeur, le seuil par groupe déjà enregistré est conservé. */
  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  minimumAvailablePerGroup?: number;
}
