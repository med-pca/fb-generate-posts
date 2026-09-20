import { Body, Controller, Module, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { ArticlesModule } from '../articles/articles.module';
import { WordpressArticleDto } from './wordpress.dto';
import { WordpressGuard } from './wordpress.guard';
import { WordpressService } from './wordpress.service';

@ApiTags('wordpress')
@ApiHeader({ name: 'x-api-key', required: true })
@Controller('wordpress')
@UseGuards(WordpressGuard)
export class WordpressController {
  constructor(private readonly wordpress: WordpressService) {}
  @Post('articles')
  publish(@Body() dto: WordpressArticleDto) {
    return this.wordpress.publish(dto);
  }
}

@Module({
  imports: [ArticlesModule],
  controllers: [WordpressController],
  providers: [WordpressService, WordpressGuard],
})
export class WordpressModule {}
