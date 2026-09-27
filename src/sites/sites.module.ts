import { Module } from '@nestjs/common';
import { SiteTargetsController, SitesController } from './sites.controller';
import { SitesService } from './sites.service';

/** Les sites WordPress avec lesquels on travaille : déclarés ici, proposés
 * à l'extension comme destinations. */
@Module({
  controllers: [SitesController, SiteTargetsController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
