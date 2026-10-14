import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Ce que l'extension Publication a vu : compte suspendu, vérification, ou déconnecté. */
export class SuspensionReportDto {
  /** `logged_out` : la page de connexion de Facebook (session perdue). */
  @IsIn(['disabled', 'checkpoint', 'logged_out'])
  kind!: 'disabled' | 'checkpoint' | 'logged_out';

  @IsOptional() @IsString() @MaxLength(500) detail?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}
