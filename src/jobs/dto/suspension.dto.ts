import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Ce que l'extension Publication a vu : compte suspendu, ou vérification. */
export class SuspensionReportDto {
  @IsIn(['disabled', 'checkpoint'])
  kind!: 'disabled' | 'checkpoint';

  @IsOptional() @IsString() @MaxLength(500) detail?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}
