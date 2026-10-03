import { Module } from '@nestjs/common';
import { AdminVerifyController, VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';
import { MembersService } from './members.service';

@Module({
  controllers: [VerifyController, AdminVerifyController],
  providers: [VerifyService, MembersService],
})
export class VerifyModule {}
