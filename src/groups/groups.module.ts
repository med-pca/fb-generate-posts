import { Module } from '@nestjs/common';
import { GroupsCatalogController, GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupJoinController } from './group-join.controller';
import { GroupLanguagesService } from './group-languages.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [GroupsController, GroupsCatalogController, GroupJoinController],
  providers: [GroupsService, GroupLanguagesService],
})
export class GroupsModule {}
