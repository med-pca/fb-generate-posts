import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ControlController } from './control.controller';
import { PairController } from './pair.controller';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';

@Module({
  imports: [CampaignsModule],
  controllers: [RunnersController, ControlController, PairController],
  providers: [RunnersService],
  exports: [RunnersService],
})
export class RunnersModule {}
