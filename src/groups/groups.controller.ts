import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('profiles/:profileId/groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  create(@Param('profileId') profileId: string, @Body() dto: CreateGroupDto) {
    return this.groups.create(profileId, dto);
  }

  @Get()
  findAll(@Param('profileId') profileId: string) {
    return this.groups.findAll(profileId);
  }

  @Post(':groupId/link')
  link(
    @Param('profileId') profileId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.groups.link(profileId, groupId);
  }

  @Delete(':groupId/link')
  unlink(
    @Param('profileId') profileId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.groups.unlink(profileId, groupId);
  }

  @Patch(':groupId')
  update(@Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    return this.groups.update(groupId, dto);
  }
}

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('groups')
export class GroupsCatalogController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    return this.groups.findCatalog(pagination);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.groups.update(id, dto);
  }
}
