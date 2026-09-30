import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  @Post('pairing-check')
  @ApiOperation({
    summary: 'Vérifier l’état réel de tous les appairages',
    description:
      'Compare la clé que chaque navigateur détient à la clé actuelle de son ' +
      'compte, l’identifiant NSTBrowser, les battements refusés et les ' +
      'battements réussis. Rend le compte par état et ce qui est à refaire.',
  })
  checkPairings(@ActingUser() acting: CurrentUser) {
    return this.runners.checkPairings(acting);
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

  @Post(':profileId/pair-code')
  @ApiOperation({
    summary: 'Émettre un code d’appairage pour ce profil',
    description:
      'Le code se colle dans l’extension du navigateur qui doit tenir ce ' +
      'profil : il lui apprend l’adresse de l’API, sa clé et lequel des ' +
      'profils il est. Valable 15 minutes, à usage unique.',
  })
  pairCode(
    @Param('profileId') profileId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.runners.createPairCode(profileId, acting);
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
