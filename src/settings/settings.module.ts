import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { ReplenishScheduler } from './replenish.scheduler';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [ArticlesModule],
  controllers: [SettingsController],
  providers: [SettingsService, ReplenishScheduler],
  exports: [SettingsService],
})
export class SettingsModule {}
