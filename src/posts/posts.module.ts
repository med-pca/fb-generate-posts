import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { QueueService } from './queue.service';
import { RepeatService } from './repeat.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, QueueService, RepeatService],
  exports: [RepeatService],
})
export class PostsModule {}
