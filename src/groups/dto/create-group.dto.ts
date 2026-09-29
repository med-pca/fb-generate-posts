import { RecordStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateGroupDto {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsUrl({ require_tld: false })
  url!: string;

  /** Obligatoire : c'est la catégorie qui décide quels articles arrivent
   * dans ce groupe. Un groupe sans catégorie ne recevrait rien. */
  @IsString()
  @IsNotEmpty({ message: 'Choisissez la catégorie du groupe' })
  categoryId!: string;
}
