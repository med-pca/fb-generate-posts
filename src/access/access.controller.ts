import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { AccessService } from './access.service';
import { GrantAccessDto } from './dto/grant-access.dto';

const SHARE = {
  summary: 'Partager en publication seule',
  description:
    'Le bénéficiaire peut s’en servir — publier dans le groupe, déposer ' +
    'sur le site — mais ni le renommer, ni le désactiver, ni le supprimer, ' +
    'ni le repartager. Accordé par le propriétaire ou un administrateur.',
};

@ApiTags('access')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('groups/:id/access')
export class GroupAccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  list(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.access.listGroupAccess(id, acting);
  }

  @Post()
  @ApiOperation(SHARE)
  grant(
    @Param('id') id: string,
    @Body() dto: GrantAccessDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.access.grantGroup(id, dto.userId, acting);
  }

  @Delete(':userId')
  revoke(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.access.revokeGroup(id, userId, acting);
  }
}

@ApiTags('access')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('sites/:id/access')
export class SiteAccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  list(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.access.listSiteAccess(id, acting);
  }

  @Post()
  @ApiOperation(SHARE)
  grant(
    @Param('id') id: string,
    @Body() dto: GrantAccessDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.access.grantSite(id, dto.userId, acting);
  }

  @Delete(':userId')
  revoke(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.access.revokeSite(id, userId, acting);
  }
}
