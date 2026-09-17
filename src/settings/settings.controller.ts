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
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ReplenishScheduler } from './replenish.scheduler';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly scheduler: ReplenishScheduler,
  ) {}

  @Get()
  async get() {
    const settings = await this.settings.get();
    // La cadence vient de l'environnement, pas de la base : l'exposer ici
    // évite d'avoir à lire les variables du serveur pour savoir si le
    // minuteur tourne.
    return {
      ...settings,
      replenishIntervalMinutes: this.scheduler.intervalMinutes(),
    };
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  @Post('replenish-now')
  @ApiOperation({
    summary: 'Compléter le stock de chaque groupe des profils actifs',
  })
  replenishNow() {
    return this.settings.replenishAll();
  }

  @Post('replenish-now/all')
  @ApiOperation({
    summary:
      'Déclencher un passage du minuteur, avec sa protection anti-chevauchement',
    description:
      'Identique au passage périodique : si un passage est déjà en cours, ' +
      'celui-ci est ignoré plutôt que de doubler la charge.',
  })
  runScheduledPass() {
    return this.scheduler.run();
  }

  @Post('replenish-now/:profileId')
  @ApiOperation({ summary: 'Compléter le stock des groupes d’un seul profil' })
  replenishProfile(@Param('profileId') profileId: string) {
    return this.settings.replenishProfile(profileId);
  }
}
