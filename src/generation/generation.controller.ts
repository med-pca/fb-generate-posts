import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { GeneratePostsDto } from './dto/generate-posts.dto';
import { GenerationService } from './generation.service';

@ApiTags('generation')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/posts')
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post('generate')
  generate(@Body() dto: GeneratePostsDto) {
    return this.generation.generate(dto);
  }
}
