import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { InsightsController, ResetController } from './insights.controller';
import { InsightsService } from './insights.service';
import { ResetService } from './reset.service';

@Module({
  imports: [CampaignsModule],
  controllers: [InsightsController, ResetController],
  providers: [InsightsService, ResetService],
})
export class InsightsModule {}
