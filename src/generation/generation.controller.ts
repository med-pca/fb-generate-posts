import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { GeneratePostsDto } from './dto/generate-posts.dto';
import { GenerationService } from './generation.service';

@ApiTags('generation')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/posts')
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post('generate')
  generate(@Body() dto: GeneratePostsDto, @ActingUser() acting: CurrentUser) {
    return this.generation.generate(dto, acting);
  }
}
