import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  create(@Body() dto: CreatePostDto, @ActingUser() acting: CurrentUser) {
    return this.posts.create(dto, acting);
  }

  @Get()
  findAll(@Query() query: QueryPostsDto, @ActingUser() acting: CurrentUser) {
    return this.posts.findAll(query, acting);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Supprimer plusieurs posts par sélection ou par filtre (dryRun pour compter d’abord)',
  })
  bulkRemove(
    @Body() dto: BulkDeletePostsDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.posts.bulkRemove(dto, acting);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.posts.findOne(id, acting);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.posts.update(id, dto, acting);
  }

  @Delete(':id')
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(
    @Param('id') id: string,
    @ActingUser() acting: CurrentUser,
    @Query('force') force?: string,
  ) {
    return this.posts.remove(id, force === 'true', acting);
  }
}
