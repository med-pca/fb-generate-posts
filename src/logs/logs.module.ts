import { Module } from '@nestjs/common';
import { LogsAdminController, LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { RescueModule } from '../jobs/rescue.module';

@Module({
  imports: [RescueModule],
  controllers: [LogsController, LogsAdminController],
  providers: [LogsService],
})
export class LogsModule {}
