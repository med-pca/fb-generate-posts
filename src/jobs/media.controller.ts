import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { MediaService } from './media.service';

@ApiTags('jobs')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('jobs/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @ApiOperation({
    summary: 'L’image d’un post, relayée par l’API',
    description:
      'Secours de l’extension quand un site refuse de lui donner l’image. ' +
      'Seules les images utilisées par un post ou un profil sont servies.',
  })
  @ApiQuery({ name: 'url', required: true })
  async image(@Query('url') url: string) {
    const { buffer, type } = await this.media.fetchPostImage(url);
    return new StreamableFile(buffer, { type, length: buffer.length });
  }
}
