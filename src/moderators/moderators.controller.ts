import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { AuditRequestDto, MemberManualDto, MemberRequestDto, VerifyClaimDto } from '../verify/dto/verify.dto';
import { MembersService } from '../verify/members.service';
import { AuditService } from '../verify/audit.service';
import { Query } from '@nestjs/common';
import { ModeratorsService } from './moderators.service';

export class ModeratorSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paused?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 20 }) @IsOptional() @IsInt() @Min(1) @Max(20) batchSize?: number;
  @ApiPropertyOptional({ minimum: 2, maximum: 240 }) @IsOptional() @IsInt() @Min(2) @Max(240) everyMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() members?: boolean;
  /** Heures de travail, en minutes depuis minuit, dans `timezone`. */
  @ApiPropertyOptional({ minimum: 0, maximum: 1439 }) @IsOptional() @IsInt() @Min(0) @Max(1439) windowStart?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1439 }) @IsOptional() @IsInt() @Min(0) @Max(1439) windowEnd?: number;
  @ApiPropertyOptional({ example: 'Europe/Paris' }) @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  /** Plafonds d'actions (vérifier, supprimer, accepter, pré-approuver…). */
  @ApiPropertyOptional({ minimum: 1, maximum: 60 }) @IsOptional() @IsInt() @Min(1) @Max(60) hourlyLimit?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 400 }) @IsOptional() @IsInt() @Min(1) @Max(400) dailyLimit?: number;
}

export class ModeratorRunDto {
  @ApiPropertyOptional({ enum: ['posts', 'members'] }) @IsOptional() @IsIn(['posts', 'members']) kind?: 'posts' | 'members';
}

export class ModeratorControlDto extends VerifyClaimDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) agent?: string;
}

/** La rubrique Modérateurs : lecture pour tous les comptes connectés (leur
 * périmètre), réglages et actions pour les administrateurs seulement. */
@ApiTags('moderators')
@UseGuards(AdminAuthGuard)
@Controller('moderators')
export class ModeratorsController {
  constructor(
    private readonly moderators: ModeratorsService,
    private readonly audit: AuditService,
    private readonly members: MembersService,
  ) {}

  @Get('preapprovals')
  @ApiOperation({ summary: 'Pré-approbations : nos profils × groupes (profils récents d’abord), filtres profil / état / recherche' })
  preapprovals(
    @ActingUser() acting: CurrentUser,
    @Query('profileId') profileId?: string,
    @Query('state') state?: string,
    @Query('search') search?: string,
  ) {
    return this.members.preapprovals({ profileId, state, search }, acting);
  }

  @Get('members')
  @ApiOperation({ summary: 'Nos profils dans les groupes : adhésions à accepter, pré-approbations à faire, bloqués' })
  membersSummary(@ActingUser() acting: CurrentUser) {
    return this.members.summary(acting);
  }

  @Post('members')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Demander au modérateur d’accepter les adhésions / de pré-approuver (tout, un profil, des liaisons) (admin)' })
  requestMembers(@Body() dto: MemberRequestDto, @ActingUser() acting: CurrentUser) {
    return this.members.request(dto.kind, { profileGroupIds: dto.profileGroupIds, profileId: dto.profileId }, acting);
  }

  @Post('members/manual')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Marquer des pré-approbations faites à la main sur Facebook, ou annuler ce marquage (admin)' })
  markManual(@Body() dto: MemberManualDto, @ActingUser() acting: CurrentUser) {
    return this.members.markManual(dto.profileGroupIds, dto.state, acting);
  }

  @Post('audit')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Contrôler la pré-approbation de nos profils (tous, un profil, ou des liaisons précises) (admin)' })
  requestAudit(@Body() dto: AuditRequestDto, @ActingUser() acting: CurrentUser) {
    return this.audit.request(dto, acting);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Résultats des contrôles de pré-approbation' })
  auditResults(@ActingUser() acting: CurrentUser, @Query('profileId') profileId?: string) {
    return this.audit.results(acting, profileId);
  }

  @Get()
  @ApiOperation({ summary: 'Les modérateurs, leur état et leurs chiffres' })
  list(@ActingUser() acting: CurrentUser) {
    return this.moderators.list(acting);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un modérateur : chiffres, 14 jours, dernières actions' })
  detail(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.moderators.detail(id, acting);
  }

  @Patch(':id/settings')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Régler un modérateur : suspendre, taille de lot, fréquence, adhésions (admin)' })
  settings(@Param('id') id: string, @Body() dto: ModeratorSettingsDto, @ActingUser() acting: CurrentUser) {
    return this.moderators.updateSettings(id, dto, acting);
  }

  @Post(':id/run')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Lancer un passage maintenant (admin)' })
  run(@Param('id') id: string, @Body() dto: ModeratorRunDto, @ActingUser() acting: CurrentUser) {
    return this.moderators.run(id, acting, dto?.kind ?? 'posts');
  }

  @Post(':id/recheck')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Remettre en vérification les publications « à traiter » (admin)' })
  recheck(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.moderators.recheck(id, acting);
  }

  @Post(':id/retry-members')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Relancer les adhésions / pré-approbations abandonnées (admin)' })
  retryMembers(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.moderators.retryMembers(id, acting);
  }
}

/** Côté terrain : l'extension du modérateur relit ses réglages. */
@ApiTags('moderators')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('verify')
export class ModeratorControlController {
  constructor(private readonly moderators: ModeratorsService) {}

  @Post('control')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réglages du modérateur et passage demandé (relu chaque minute par l’extension)' })
  control(@Body() dto: ModeratorControlDto, @ActingUser() acting: CurrentUser | null) {
    return this.moderators.control(dto.profileExternalId, dto.agent, acting);
  }
}
