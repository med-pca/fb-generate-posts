import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { BrowserReportDto } from './dto/browser-report.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { SyncProfilesDto } from './dto/sync-profiles.dto';
import { RunnersService } from './runners.service';

/** Côté terrain : ce que l'extension d'un navigateur et l'agent local viennent
 * demander.
 *
 * L'ordre voyage toujours dans ce sens. L'API ne peut pas appeler un
 * navigateur : le client NSTBrowser n'écoute que sur la machine où il tourne,
 * et un navigateur n'a pas d'adresse joignable. Donc chacun revient demander
 * « est-ce mon tour ? », et repart avec la réponse et ses réglages.
 */
@ApiTags('control')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('control')
export class ControlController {
  constructor(private readonly runners: RunnersService) {}

  @Get('profile/:profileExternalId')
  @ApiOperation({
    summary: 'Ce profil doit-il publier maintenant ?',
    description:
      'Rend l’ordre, sa raison, le délai avant de redemander, et les réglages ' +
      'poussés depuis l’admin. Ne modifie rien.',
  })
  control(
    @Param('profileExternalId') profileExternalId: string,
    @ActingUser() acting: CurrentUser | null,
  ) {
    return this.runners.control(profileExternalId, acting);
  }

  @Post('profile/:profileExternalId/heartbeat')
  @ApiOperation({
    summary: 'Battement de l’extension : elle rapporte, et reçoit l’ordre',
    description:
      'Un seul aller-retour par minute : un état sans ordre obligerait à un ' +
      'second appel, un ordre sans état laisserait l’admin aveugle.',
  })
  heartbeat(
    @Param('profileExternalId') profileExternalId: string,
    @Body() dto: HeartbeatDto,
    @ActingUser() acting: CurrentUser | null,
    @Headers('x-api-key') apiKey?: string,
  ) {
    // La clé sert à reconnaître plus tard un appairage que des changements
    // ont cassé : son empreinte seule est gardée.
    return this.runners.heartbeat(profileExternalId, dto, acting, apiKey);
  }

  @Get('launcher')
  @ApiOperation({
    summary: 'Quels navigateurs ouvrir, lesquels refermer',
    description:
      'Pour l’agent local. `mayClose` est distinct de `shouldRun` : une ' +
      'extension en train de publier ne doit pas voir son navigateur se ' +
      'fermer sous elle, même quand l’ordre vient de passer à l’arrêt.',
  })
  launcher(@ActingUser() acting: CurrentUser | null) {
    return this.runners.launcherPlan(acting);
  }

  @Post('profiles/sync')
  @ApiOperation({
    summary: 'Créer les profils NSTBrowser que la plateforme ne connaît pas',
    description:
      'L’agent local envoie les profils de son NSTBrowser. Les absents sont ' +
      'créés au nom du compte de la clé (sans propriétaire avec la clé ' +
      'globale). Rien n’est renommé ni supprimé.',
  })
  syncProfiles(
    @Body() dto: SyncProfilesDto,
    @ActingUser() acting: CurrentUser | null,
  ) {
    return this.runners.syncProfiles(dto.profiles, acting);
  }

  @Post('launcher/:profileExternalId')
  @ApiOperation({ summary: 'L’agent local dit ce qu’il a fait du navigateur' })
  reportBrowser(
    @Param('profileExternalId') profileExternalId: string,
    @Body() dto: BrowserReportDto,
    @ActingUser() acting: CurrentUser | null,
  ) {
    return this.runners.reportBrowser(profileExternalId, dto, acting);
  }
}
