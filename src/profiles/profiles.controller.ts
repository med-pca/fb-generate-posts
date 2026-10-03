import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DeactivateProfileDto, QueryProfilesDto } from './dto/query-profiles.dto';
import { ProfileHealthService } from './profile-health.service';

@ApiTags('profiles')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly health: ProfileHealthService,
  ) {}

  @Post()
  create(@Body() dto: CreateProfileDto, @ActingUser() acting: CurrentUser) {
    return this.profiles.create(dto, acting);
  }

  @Get()
  findAll(
    @Query() query: QueryProfilesDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.profiles.findAll(query, acting);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Statistiques détaillées, score de santé, indice de désactivation et plan de transfert' })
  detail(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.health.detail(id, acting);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Désactiver un profil et confier ses posts en attente à un autre',
    description:
      'Libère son lot en cours, passe ses publications forcées et ses posts au profil choisi (là où il a rejoint le groupe), ' +
      'les autres retournent à la file. Signale les groupes où il était le seul profil.',
  })
  deactivate(@Param('id') id: string, @Body() dto: DeactivateProfileDto, @ActingUser() acting: CurrentUser) {
    return this.health.deactivate(id, dto.transferTo ?? null, acting);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.profiles.findOne(id, acting);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.profiles.update(id, dto, acting);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.profiles.remove(id, acting);
  }
}
