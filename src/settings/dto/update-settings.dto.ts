import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean()
  autoReplenishEnabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(1000)
  minimumAvailablePerProfile!: number;
}
