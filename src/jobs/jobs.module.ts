import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [JobsController, MediaController],
  providers: [JobsService, MediaService],
})
export class JobsModule {}
