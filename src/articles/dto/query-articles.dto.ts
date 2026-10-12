import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Filtrer et trier la page Articles. */
export class QueryArticlesDto extends PaginationDto {
  /** Titre, adresse ou identifiant de l'article. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;

  /** Le site d'origine. */
  @ApiPropertyOptional() @IsOptional() @IsString() siteId?: string;

  /** La catégorie du site, ou `none` : site sans catégorie. */
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';

  /** `yes` : archivés (déjà publiés au moins une fois) ; `no` : pas encore. */
  @ApiPropertyOptional({ enum: ['yes', 'no'] })
  @IsOptional() @IsIn(['yes', 'no']) archived?: 'yes' | 'no';

  /** Où en est sa diffusion :
   *   `queued`     des publications attendent ou sont en cours ;
   *   `published`  publié dans au moins un groupe ;
   *   `idle`       a des posts, mais plus rien en file (à recréer ?) ;
   *   `failed`     au moins une publication en échec ;
   *   `never`      aucun post. */
  @ApiPropertyOptional({ enum: ['queued', 'published', 'idle', 'failed', 'never'] })
  @IsOptional() @IsIn(['queued', 'published', 'idle', 'failed', 'never']) diffusion?: 'queued' | 'published' | 'idle' | 'failed' | 'never';

  /** Importé à partir de / jusqu'à (dates ISO). */
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ enum: ['recent', 'oldest', 'title', 'priority', 'published'] })
  @IsOptional() @IsIn(['recent', 'oldest', 'title', 'priority', 'published']) sort?: 'recent' | 'oldest' | 'title' | 'priority' | 'published';
}
