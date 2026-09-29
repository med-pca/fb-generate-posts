import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { QueueService } from './queue.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, QueueService],
})
export class PostsModule {}
