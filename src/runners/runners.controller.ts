import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { UpdateRunnerDto } from './dto/update-runner.dto';
import { RunnersService } from './runners.service';

/** Côté admin : l'interrupteur de chaque profil et ce que son navigateur
 * rapporte. */
@ApiTags('runners')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('runners')
export class RunnersController {
  constructor(private readonly runners: RunnersService) {}

  @Get()
  @ApiOperation({
    summary: 'Pilotage de tous les profils, avec leur état en direct',
    description:
      'Un profil jamais piloté apparaît à l’arrêt : la ligne de pilotage naît ' +
      'au premier réglage ou au premier battement de son navigateur.',
  })
  list(@ActingUser() acting: CurrentUser) {
    return this.runners.list(acting);
  }

  @Patch('all')
  @ApiOperation({
    summary: 'Régler tous les profils d’un coup',
    description:
      'Ce qu’on cherche quand quelque chose va mal : tout arrêter sans ouvrir ' +
      'vingt interrupteurs. Pour couper aussi les profils inactifs, utiliser ' +
      'le coupe-circuit global des Paramètres.',
  })
  updateAll(@Body() dto: UpdateRunnerDto, @ActingUser() acting: CurrentUser) {
    return this.runners.updateAll(dto, acting);
  }

  @Patch(':profileId')
  @ApiOperation({ summary: 'Régler le pilotage d’un profil' })
  update(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateRunnerDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.runners.update(profileId, dto, acting);
  }
}
