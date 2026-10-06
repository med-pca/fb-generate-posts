import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { QueueService } from './queue.service';
import { RepeatService } from './repeat.service';
import { PublishedService } from './published.service';
import { PrioritiesService } from './priorities.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, QueueService, RepeatService, PublishedService, PrioritiesService],
  exports: [RepeatService],
})
export class PostsModule {}
