import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class NstProfileDto {
  @ApiProperty({ example: '5727a89e-20d1-4438-a424-9ea5c2e10ca0' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalId!: string;

  @ApiProperty({ example: 'Salim' })
  @IsString()
  @MaxLength(200)
  name!: string;
}

/** Les profils que l'agent local trouve dans NSTBrowser. */
export class SyncProfilesDto {
  @ApiProperty({ type: [NstProfileDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => NstProfileDto)
  profiles!: NstProfileDto[];
}
