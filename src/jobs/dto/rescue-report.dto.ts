import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** 🛟 Ce que le profil sauveteur a fait sous le post d'un autre. */
export class RescueReportDto {
  /** Le profil sauveteur (celui qui a réservé ce sauvetage). */
  @IsString() @IsNotEmpty() @MaxLength(200) profileExternalId!: string;
  /** `done` : lien posé ; `already` : déjà sous le post ; `failed` : impossible. */
  @IsIn(['done', 'already', 'failed']) outcome!: 'done' | 'already' | 'failed';
  @IsOptional() @IsString() @MaxLength(500) detail?: string;
  /** L'identifiant de SON commentaire, quand il l'a posé. */
  @IsOptional() @IsString() @MaxLength(200) commentExternalId?: string;
}
