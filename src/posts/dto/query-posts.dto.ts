import { PostStatus, SourceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Filtres de la liste : ce sont aussi ceux d'une suppression en masse, pour
 * qu'un administrateur supprime exactement ce que l'écran lui montre. */
export class QueryPostsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  profileId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  articleId?: string;

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @IsOptional()
  @IsString()
  search?: string;
}
