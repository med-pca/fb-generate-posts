import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Les campagnes du compte, avec leur avancement' })
  list(@ActingUser() acting: CurrentUser) {
    return this.campaigns.list(acting);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Une campagne : avancement, série, statistiques par article, profil, groupe' })
  detail(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.campaigns.detail(id, acting);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une campagne (site obligatoire)' })
  create(@Body() dto: CreateCampaignDto, @ActingUser() acting: CurrentUser) {
    return this.campaigns.create(dto, acting);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une campagne, la mettre en pause, la terminer' })
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @ActingUser() acting: CurrentUser) {
    return this.campaigns.update(id, dto, acting);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une campagne (posts et articles intacts)' })
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.campaigns.remove(id, acting);
  }
}
