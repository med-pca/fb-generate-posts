import { IsArray, IsOptional, IsString } from 'class-validator';

/** Recréer les posts d'un article dans ces groupes. */
export class RecreatePostsDto {
  /** Vide = tous les groupes actifs de sa catégorie. */
  @IsOptional() @IsArray() @IsString({ each: true }) groupIds?: string[];
}
