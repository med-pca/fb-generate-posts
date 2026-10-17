import { GroupTasksService } from './group-tasks.service';
import { Module } from '@nestjs/common';
import { RescueModule } from '../jobs/rescue.module';
import { AdminVerifyController, VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';
import { MembersService } from './members.service';
import { AuditService } from './audit.service';

@Module({
  imports: [RescueModule],
  controllers: [VerifyController, AdminVerifyController],
  providers: [VerifyService, MembersService, AuditService, GroupTasksService],
  exports: [VerifyService, MembersService, AuditService],
})
export class VerifyModule {}
