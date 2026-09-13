import { Module } from '@nestjs/common';
import { GroupsCatalogController, GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  controllers: [GroupsController, GroupsCatalogController],
  providers: [GroupsService],
})
export class GroupsModule {}
