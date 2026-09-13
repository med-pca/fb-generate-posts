import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsString, Max, Min } from 'class-validator';

export class GenerateArticlePostsDto {
  @ApiProperty()
  @IsString()
  profileId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  groupIds!: string[];

  @ApiProperty({ default: 10 })
  @IsInt()
  @Min(0)
  @Max(1440)
  delayMin = 10;

  @ApiProperty({ default: 60 })
  @IsInt()
  @Min(0)
  @Max(1440)
  delayMax = 60;
}
