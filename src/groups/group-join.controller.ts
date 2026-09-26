import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JoinStatus } from '@prisma/client';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { UpdateJoinStatusDto } from './dto/update-join-status.dto';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('join/profiles/:profileExternalId/groups')
export class GroupJoinController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @ApiOperation({
    summary: 'Groupes liés au profil, avec leur statut d’adhésion',
    description:
      'Utilisé par l’extension navigateur. Par défaut, seuls les groupes ' +
      'NOT_JOINED et FAILED sont rendus : ceux qu’il reste à rejoindre.',
  })
  @ApiParam({ name: 'profileExternalId', example: 'demo-profile' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Liste séparée par des virgules, ou "all"',
    example: 'NOT_JOINED,FAILED',
  })
  list(
    @Param('profileExternalId') profileExternalId: string,
    @Query('status') status?: string,
  ) {
    const statuses =
      status === 'all'
        ? undefined
        : (status || 'NOT_JOINED,FAILED')
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter((s): s is JoinStatus => s in JoinStatus);
    return this.groups.findForJoin(profileExternalId, statuses);
  }

  @Post(':groupId/join-status')
  @ApiOperation({ summary: 'Enregistrer le résultat d’une tentative d’adhésion' })
  updateStatus(
    @Param('profileExternalId') profileExternalId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateJoinStatusDto,
  ) {
    return this.groups.updateJoinStatus(profileExternalId, groupId, dto);
  }
}
