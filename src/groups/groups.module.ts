import { Module } from '@nestjs/common';
import { GroupsCatalogController, GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupJoinController } from './group-join.controller';

@Module({
  controllers: [GroupsController, GroupsCatalogController, GroupJoinController],
  providers: [GroupsService],
})
export class GroupsModule {}
