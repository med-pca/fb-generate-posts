import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
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
  findAll(
    @Query() pagination: PaginationDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.articles.findAll(pagination, acting);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.articles.findOne(id, acting);
  }

  @Post('import')
  @ApiOperation({
    summary: 'Importer ou actualiser un article depuis son API JSON',
  })
  import(@Body() dto: ImportArticleDto, @ActingUser() acting: CurrentUser) {
    return this.articles.import(dto, acting);
  }

  @Post(':id/generate-posts')
  @ApiOperation({ summary: 'Créer un post par légende sociale de l’article' })
  generatePosts(
    @Param('id') id: string,
    @Body() dto: GenerateArticlePostsDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.articles.generatePosts(id, dto, acting);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.articles.update(id, dto, acting);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.articles.remove(id, acting);
  }
}
