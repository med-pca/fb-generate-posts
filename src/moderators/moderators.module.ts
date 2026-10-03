import { Module } from '@nestjs/common';
import { VerifyModule } from '../verify/verify.module';
import { ModeratorControlController, ModeratorsController } from './moderators.controller';
import { ModeratorsService } from './moderators.service';

@Module({
  imports: [VerifyModule],
  controllers: [ModeratorsController, ModeratorControlController],
  providers: [ModeratorsService],
})
export class ModeratorsModule {}
