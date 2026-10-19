import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { QueueService } from './queue.service';
import { RepeatService } from './repeat.service';
import { PublishedService } from './published.service';
import { PrioritiesService } from './priorities.service';
import { RescueModule } from '../jobs/rescue.module';

@Module({
  imports: [RescueModule],
  controllers: [PostsController],
  providers: [PostsService, QueueService, RepeatService, PublishedService, PrioritiesService],
  exports: [RepeatService],
})
export class PostsModule {}
