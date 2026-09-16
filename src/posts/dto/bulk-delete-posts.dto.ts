import { Transform } from 'class-transformer';
import { PostStatus, SourceType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === 1 || value === '1';

export class BulkDeletePostsDto {
  /** Sélection explicite. Combinée aux filtres, elle les restreint encore. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids?: string[];

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

  /** Compte ce qui serait supprimé sans rien toucher. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  dryRun = false;

  /** Supprime aussi les posts réservés par un automate en cours. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  force = false;
}
