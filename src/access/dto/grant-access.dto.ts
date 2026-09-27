import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GrantAccessDto {
  @ApiProperty({ description: 'Le compte à qui donner accès' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  userId!: string;
}
