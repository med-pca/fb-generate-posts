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
import { QueryGroupsDto } from './dto/query-groups.dto';
import { GroupLanguagesService } from './group-languages.service';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional as IsOpt, IsString as IsStr, ValidateIf as VIf } from 'class-validator';
import { IsKnownLanguage } from '../languages/languages.registry';

export class GroupLanguagesDto {
  @IsOpt() @IsArray() @ArrayMaxSize(1000) @IsStr({ each: true }) groupIds?: string[];
  @IsOpt() @IsStr() categoryId?: string;
  @IsOpt() @IsBoolean() onlyMissing?: boolean;
  /** null = retirer la langue. */
  @VIf((_d, v) => v !== null) @IsKnownLanguage() language!: string | null;
}

export class SuggestLanguagesDto {
  @IsOpt() @IsStr() categoryId?: string;
}
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetJoinStatusDto } from './dto/update-join-status.dto';

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
  constructor(
    private readonly groups: GroupsService,
    private readonly languages: GroupLanguagesService,
  ) {}

  @Get()
  findAll(@Query() query: QueryGroupsDto, @ActingUser() acting: CurrentUser) {
    return this.groups.findCatalog(query, acting);
  }

  // Avant `:id` : « languages » serait pris pour un identifiant.
  @Get('languages')
  @ApiOperation({ summary: 'Langues des groupes : combien par langue, et sans langue' })
  languageSummary(@ActingUser() acting: CurrentUser) {
    return this.languages.summary(acting);
  }

  @Post('languages')
  @ApiOperation({ summary: 'Appliquer une langue à des groupes choisis, ou à une catégorie (seulement ceux sans langue au choix)' })
  setLanguages(@Body() dto: GroupLanguagesDto, @ActingUser() acting: CurrentUser) {
    return this.languages.setMany(dto, acting);
  }

  @Post('languages/suggest')
  @ApiOperation({ summary: 'Proposer la langue des groupes sans langue, d’après leur nom (rien n’est enregistré)' })
  suggestLanguages(@Body() dto: SuggestLanguagesDto, @ActingUser() acting: CurrentUser) {
    return this.languages.suggest(acting, dto.categoryId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.groups.remove(id, acting);
  }

  @Patch(':id/profiles/:profileId/join-status')
  @ApiOperation({
    summary: 'Corriger à la main l’adhésion d’un profil à un groupe',
    description:
      'Quand un profil a rejoint le groupe sans que l’extension le remonte ' +
      '(demande acceptée plus tard, adhésion faite à la main). Seul un profil ' +
      '« Rejoint » peut publier dans le groupe.',
  })
  setJoinStatus(
    @Param('id') id: string,
    @Param('profileId') profileId: string,
    @Body() dto: SetJoinStatusDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.groups.setJoinStatus(id, profileId, dto.joinStatus, acting);
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
