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
  create(@Body() dto: CreatePostDto) {
    return this.posts.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryPostsDto) {
    return this.posts.findAll(query);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Supprimer plusieurs posts par sélection ou par filtre (dryRun pour compter d’abord)',
  })
  bulkRemove(@Body() dto: BulkDeletePostsDto) {
    return this.posts.bulkRemove(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.posts.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(id, dto);
  }

  @Delete(':id')
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.posts.remove(id, force === 'true');
  }
}
