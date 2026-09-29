import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CategoryDto {
  @ApiProperty({ example: 'Recettes' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
