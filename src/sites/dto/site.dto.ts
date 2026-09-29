import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { RecordStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ example: 'Tera Nordiskmat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'https://tera.nordiskmat.com' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  originUrl!: string;

  @ApiPropertyOptional({
    description:
      'Clé du plugin de ce site. Laissée vide, la clé globale ' +
      'WORDPRESS_API_KEY sert. Vide à la modification : la clé en place est ' +
      'conservée.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  depositKey?: string;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @ApiPropertyOptional({
    description:
      'Ses articles partent vers les groupes de cette catégorie. Chaîne vide = aucune.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryId?: string;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {
  @ApiPropertyOptional({
    description:
      'Réattribuer le site à un autre compte. Chaîne vide : plus de ' +
      'propriétaire, donc réservé aux administrateurs.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ownerId?: string;
}
