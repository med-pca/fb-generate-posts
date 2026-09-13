import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class ImportArticleDto {
  @ApiProperty({
    example:
      'https://pulserecipe.com/recipes/garlic-herb-pork-tenderloin-caramelized-apple-reduction',
    description:
      "URL publique de l’article (/recipes/...) ou URL directe de son API JSON",
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  jsonUrl!: string;

  @ApiProperty({ example: 'Pulse Recipe', required: false })
  @IsString()
  sourceName?: string;
}
