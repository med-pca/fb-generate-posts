import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class FailScrapeDto {
  @ApiProperty({ example: 'Publication introuvable ou supprimée' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  error!: string;
}
