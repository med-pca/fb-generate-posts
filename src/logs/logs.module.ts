import { Module } from '@nestjs/common';
import { LogsAdminController, LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  controllers: [LogsController, LogsAdminController],
  providers: [LogsService],
})
export class LogsModule {}
