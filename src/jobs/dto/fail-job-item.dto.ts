import { IsString } from 'class-validator';

export class FailJobItemDto {
  @IsString()
  error!: string;
}
