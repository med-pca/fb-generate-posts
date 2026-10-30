import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { ProfileHealthService } from './profile-health.service';
import { ProfileOverviewService } from './profile-overview.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileHealthService, ProfileOverviewService],
  exports: [ProfileHealthService],
})
export class ProfilesModule {}
