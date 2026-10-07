import { RecordStatus } from '@prisma/client';
import {
  ValidateIf,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { IsKnownLanguage } from '../../languages/languages.registry';

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

  /** La langue des membres (en, fr, ar…). null = non précisée. Les posts
   * « engagement » ne vont qu'aux groupes de la langue choisie. */
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsKnownLanguage()
  language?: string | null;
}
