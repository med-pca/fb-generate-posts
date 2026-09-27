import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrowserState } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Ce que l'agent local rapporte du navigateur : lui seul peut l'ouvrir, donc
 * lui seul sait s'il est ouvert. */
export class BrowserReportDto {
  @ApiProperty({ enum: BrowserState })
  @IsEnum(BrowserState)
  state!: BrowserState;

  @ApiPropertyOptional({ example: 'NSTBrowser: profil introuvable' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
