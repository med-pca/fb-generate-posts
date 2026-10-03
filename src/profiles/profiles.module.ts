import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { ProfileHealthService } from './profile-health.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileHealthService],
  exports: [ProfileHealthService],
})
export class ProfilesModule {}
