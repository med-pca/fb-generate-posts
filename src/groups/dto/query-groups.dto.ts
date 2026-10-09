import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Filtrer et trier la page Groupes. */
export class QueryGroupsDto extends PaginationDto {
  /** Nom, adresse Facebook ou identifiant externe. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;

  /** Une catégorie, ou `none` : les groupes « à ranger ». */
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';

  /** Un code de langue, ou `none` : sans langue. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(12) language?: string;

  /** Les groupes liés à ce profil. */
  @ApiPropertyOptional() @IsOptional() @IsString() profileId?: string;

  /** `joined` : au moins un profil l'a rejoint ; `none` : aucun ; `pending` :
   * une demande d'adhésion attend. */
  @ApiPropertyOptional({ enum: ['joined', 'none', 'pending'] })
  @IsOptional() @IsIn(['joined', 'none', 'pending']) join?: 'joined' | 'none' | 'pending';

  /** `with` : des posts attendent ; `none` : rien à publier. */
  @ApiPropertyOptional({ enum: ['with', 'none'] })
  @IsOptional() @IsIn(['with', 'none']) stock?: 'with' | 'none';

  @ApiPropertyOptional({ enum: ['recent', 'name', 'priority'] })
  @IsOptional() @IsIn(['recent', 'name', 'priority']) sort?: 'recent' | 'name' | 'priority';
}
