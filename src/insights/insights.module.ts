import { Module } from '@nestjs/common';
import { InsightsController, ResetController } from './insights.controller';
import { InsightsService } from './insights.service';
import { ResetService } from './reset.service';

@Module({
  controllers: [InsightsController, ResetController],
  providers: [InsightsService, ResetService],
})
export class InsightsModule {}
