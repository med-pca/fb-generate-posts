import { Module } from '@nestjs/common';
import {
  GroupAccessController,
  SiteAccessController,
} from './access.controller';
import { AccessService } from './access.service';

/** Les partages : donner à un compte le droit de publier dans un groupe ou
 * de déposer sur un site, sans lui donner la main dessus. */
@Module({
  controllers: [GroupAccessController, SiteAccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
