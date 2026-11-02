import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

/** Recréer les posts d'un article dans ces groupes. */
export class RecreatePostsDto {
  /** Vide = tous les groupes actifs de sa catégorie. */
  @IsOptional() @IsArray() @IsString({ each: true }) groupIds?: string[];
}

/** Recréer les posts de plusieurs articles (tous les groupes de leur catégorie). */
export class RecreateManyDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) articleIds!: string[];
}
