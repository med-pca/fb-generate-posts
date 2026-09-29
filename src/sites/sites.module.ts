import { Module } from '@nestjs/common';
import { SiteTargetsController, SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { PluginCheckService } from './plugin-check.service';

/** Les sites WordPress avec lesquels on travaille : déclarés ici, proposés
 * à l'extension comme destinations. */
@Module({
  controllers: [SitesController, SiteTargetsController],
  providers: [SitesService, PluginCheckService],
  exports: [SitesService, PluginCheckService],
})
export class SitesModule {}
