import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean()
  autoReplenishEnabled!: boolean;

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
