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
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
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

  @Post('replenish-now/:profileId')
  @ApiOperation({ summary: 'Compléter le stock des groupes d’un seul profil' })
  replenishProfile(@Param('profileId') profileId: string) {
    return this.settings.replenishProfile(profileId);
  }
}
