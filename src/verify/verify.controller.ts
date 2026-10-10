import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { AuditResultDto, MemberResultDto, ModeratorDto, PostApprovalResultDto, RemovalResultDto, ResolveDto, VerifyClaimDto, VerifyResultDto } from './dto/verify.dto';
import { GroupTasksService } from './group-tasks.service';
import { AuditService } from './audit.service';
import { VerifyService } from './verify.service';
import { MembersService } from './members.service';

/** Côté terrain : l'extension « FB Post Checker » du profil vérificateur. */
@ApiTags('verify')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('verify')
export class VerifyController {
  constructor(
    private readonly verify: VerifyService,
    private readonly members: MembersService,
    private readonly audit: AuditService,
    private readonly groupTasks: GroupTasksService,
  ) {}

  @Post('removals/claim')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réserver les retraits de groupes demandés pour nos profils suspendus par Facebook' })
  claimRemovals(@Body() dto: VerifyClaimDto, @ActingUser() acting: CurrentUser | null) {
    return this.groupTasks.claimRemovals(dto.profileExternalId, dto.limit ?? 2, acting);
  }

  @Post('removals/:taskId/result')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rapporter un retrait de groupe (fait, plus membre, pas la permission…)' })
  removalResult(@Param('taskId') taskId: string, @Body() dto: RemovalResultDto, @ActingUser() acting: CurrentUser | null) {
    return this.groupTasks.reportRemoval(taskId, dto, acting);
  }

  @Post('post-approvals/claim')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réserver nos posts en attente de validation, à valider dans les groupes' })
  claimPostApprovals(@Body() dto: VerifyClaimDto, @ActingUser() acting: CurrentUser | null) {
    return this.groupTasks.claimApprovals(dto.profileExternalId, dto.limit ?? 2, acting);
  }

  @Post('post-approvals/:taskId/result')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rapporter la validation d’un de nos posts en attente' })
  postApprovalResult(@Param('taskId') taskId: string, @Body() dto: PostApprovalResultDto, @ActingUser() acting: CurrentUser | null) {
    return this.groupTasks.reportApproval(taskId, dto, acting);
  }

  @Post('members/audit/claim')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réserver les contrôles de pré-approbation demandés par l’admin' })
  claimAudit(@Body() dto: VerifyClaimDto, @ActingUser() acting: CurrentUser | null) {
    return this.audit.claim(dto.profileExternalId, dto.limit ?? 5, acting);
  }

  @Post('members/audit/:taskId/result')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rapporter un contrôle : déjà pré-approuvé, pas fait, corrigé…' })
  auditResult(@Param('taskId') taskId: string, @Body() dto: AuditResultDto, @ActingUser() acting: CurrentUser | null) {
    return this.audit.report(taskId, dto, acting);
  }

  @Post('members/claim')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Réserver les adhésions à accepter et les profils à pré-approuver',
    description:
      'Uniquement NOS profils, désignés par leur identifiant Facebook numérique. ' +
      'Le vérificateur doit être admin ou modérateur des groupes.',
  })
  claimMembers(@Body() dto: VerifyClaimDto, @ActingUser() acting: CurrentUser | null) {
    return this.members.claim(dto.profileExternalId, dto.limit ?? 5, acting);
  }

  @Post('members/:taskId/result')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rapporter une adhésion acceptée / une pré-approbation' })
  memberResult(
    @Param('taskId') taskId: string,
    @Body() dto: MemberResultDto,
    @ActingUser() acting: CurrentUser | null,
  ) {
    return this.members.report(taskId, dto, acting);
  }

  @Post('claim')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Réserver des publications à vérifier',
    description:
      'Publiées depuis au moins VERIFY_AFTER_MINUTES (30 min par défaut), ' +
      'pas encore vérifiées. Réservées 20 min pour ce vérificateur.',
  })
  claim(@Body() dto: VerifyClaimDto, @ActingUser() acting: CurrentUser | null) {
    return this.verify.claim(dto.profileExternalId, dto.limit ?? 5, acting);
  }

  @Post(':targetId/result')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rapporter ce que le vérificateur a vu',
    description:
      'ok → vérifié ; missing_post → republié ; missing_link + deleted → ' +
      'republié, sans deleted → à traiter ; pending / unreachable → plus tard.',
  })
  result(
    @Param('targetId') targetId: string,
    @Body() dto: VerifyResultDto,
    @ActingUser() acting: CurrentUser | null,
  ) {
    return this.verify.report(targetId, dto, acting);
  }
}

/** Côté admin : désigner le vérificateur, voir le bilan, trancher. */
@ApiTags('verify')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/verify')
export class AdminVerifyController {
  constructor(
    private readonly verify: VerifyService,
    private readonly members: MembersService,
    private readonly groupTasks: GroupTasksService,
  ) {}

  @Get('suspended')
  @ApiOperation({ summary: 'Nos profils suspendus par Facebook, et le retrait de nos groupes' })
  suspended(@ActingUser() acting: CurrentUser) {
    return this.groupTasks.suspendedOverview(acting);
  }

  @Get()
  @ApiOperation({ summary: 'Bilan de la vérification et publications à traiter' })
  async overview(@ActingUser() acting: CurrentUser) {
    const [stats, review, members] = await Promise.all([
      this.verify.stats(acting),
      this.verify.review(acting),
      this.members.overview(acting),
    ]);
    return { ...stats, review, members };
  }

  @Patch('profiles/:profileId')
  @ApiOperation({ summary: 'Désigner (ou non) un profil vérificateur' })
  moderator(
    @Param('profileId') profileId: string,
    @Body() dto: ModeratorDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.verify.setModerator(profileId, dto, acting);
  }

  @Post('members/:taskId/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Relancer une adhésion / pré-approbation abandonnée' })
  retryMember(@Param('taskId') taskId: string, @ActingUser() acting: CurrentUser) {
    return this.members.retry(taskId, acting);
  }

  @Post('targets/:targetId/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trancher une publication à traiter : ok ou republier' })
  resolve(
    @Param('targetId') targetId: string,
    @Body() dto: ResolveDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.verify.resolve(targetId, dto.action, acting);
  }
}
