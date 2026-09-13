import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class GeneratePostsDto {
  @IsString()
  profileId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  groupIds!: string[];

  @IsString()
  topic!: string;

  @IsOptional()
  @IsString()
  language = 'fr';

  @IsInt()
  @Min(1)
  @Max(50)
  count!: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsInt()
  @Min(0)
  @Max(1440)
  delayMin!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  delayMax!: number;
}
