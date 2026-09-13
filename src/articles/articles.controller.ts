import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ArticlesService } from './articles.service';
import { GenerateArticlePostsDto } from './dto/generate-article-posts.dto';
import { ImportArticleDto } from './dto/import-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('articles')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    return this.articles.findAll(pagination);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articles.findOne(id);
  }

  @Post('import')
  @ApiOperation({ summary: 'Importer ou actualiser un article depuis son API JSON' })
  import(@Body() dto: ImportArticleDto) {
    return this.articles.import(dto);
  }

  @Post(':id/generate-posts')
  @ApiOperation({ summary: 'Créer un post par légende sociale de l’article' })
  generatePosts(
    @Param('id') id: string,
    @Body() dto: GenerateArticlePostsDto,
  ) {
    return this.articles.generatePosts(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articles.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.articles.remove(id);
  }
}
