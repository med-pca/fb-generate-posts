import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class JsonPostDto {
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsInt()
  @Min(0)
  @Max(1440)
  delay!: number;
}

export class ImportJsonDto {
  @IsString()
  profileId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  groupIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JsonPostDto)
  posts!: JsonPostDto[];
}
