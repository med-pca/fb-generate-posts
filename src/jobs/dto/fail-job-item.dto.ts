import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class FailJobItemDto {
  @IsString()
  error!: string;

  /** Rien n'est parti sur Facebook (échec AVANT le clic « Publier ») : le post
   * peut repartir dans la file tout seul, plutôt qu'attendre un « Relancer ». */
  @IsOptional()
  @IsBoolean()
  requeue?: boolean;

  /** Facebook limite ce compte (« We limit how often you can post… ») : la
   * plateforme le met en pause et confie son travail aux autres profils. */
  @IsOptional()
  @IsBoolean()
  blocked?: boolean;
}
