import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { MediaController } from './media.controller';
import { AdminJobsController } from './admin-jobs.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [JobsController, MediaController, AdminJobsController],
  providers: [JobsService, MediaService],
  exports: [JobsService],
})
export class JobsModule {}
