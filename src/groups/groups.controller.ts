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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
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
  create(
    @Param('profileId') profileId: string,
    @Body() dto: CreateGroupDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.create(profileId, dto, acting);
  }

  @Get()
  findAll(
    @Param('profileId') profileId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.findAll(profileId, acting);
  }

  @Post(':groupId/link')
  link(
    @Param('profileId') profileId: string,
    @Param('groupId') groupId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.link(profileId, groupId, acting);
  }

  @Delete(':groupId/link')
  unlink(
    @Param('profileId') profileId: string,
    @Param('groupId') groupId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.unlink(profileId, groupId, acting);
  }

  @Patch(':groupId')
  update(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.update(groupId, dto, acting);
  }
}

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('groups')
export class GroupsCatalogController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.findCatalog(pagination, acting);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.groups.remove(id, acting);
  }

  @Delete(':id/posts')
  @ApiOperation({
    summary: 'Retirer de ce groupe les posts qui y attendent',
    description:
      'Seule la cible de ce groupe part : un post qui vise aussi d’autres ' +
      'groupes y reste, un post qui ne visait que celui-ci est supprimé. Les ' +
      'publications faites ou en cours sont conservées. `dryRun=true` compte ' +
      'sans rien toucher.',
  })
  removePosts(
    @Param('id') id: string,
    @Query('dryRun') dryRun: string | undefined,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.removePosts(id, acting, dryRun === 'true');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.update(id, dto, acting);
  }
}
