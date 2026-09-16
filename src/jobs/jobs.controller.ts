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
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { ClaimJobDto } from './dto/claim-job.dto';
import { ClaimBatchDto } from './dto/claim-batch.dto';
import { CommentJobItemDto } from './dto/comment-job-item.dto';
import { FailJobItemDto } from './dto/fail-job-item.dto';
import { LinkUpdatedJobItemDto } from './dto/link-updated-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('profiles')
  @ApiOperation({
    summary: 'Profils actifs que l’automatisation peut traiter',
    description:
      'Permet à un worker de découvrir les profils sans avoir besoin des ' +
      'droits admin : seuls le nom et l’externalId sont exposés.',
  })
  listProfiles() {
    return this.jobs.listAutomationProfiles();
  }

  @Post('claim')
  claim(@Body() dto: ClaimJobDto) {
    return this.jobs.claim(dto);
  }

  @Post('claim/batch')
  @ApiOperation({
    summary:
      'Réserver un job par profil, pour traiter plusieurs lots en parallèle',
    description:
      'Rend au plus un job par profil actif (10 par défaut). Un profil qui ' +
      'tient déjà un job non expiré est écarté : deux threads ne doivent ' +
      'jamais piloter le même compte en même temps.',
  })
  claimBatch(@Body() dto: ClaimBatchDto) {
    return this.jobs.claimBatch(dto);
  }

  @Get('link-updates')
  @ApiOperation({
    summary: 'Commentaires en attente d’URL, tous jobs clôturés confondus',
  })
  @ApiQuery({ name: 'profileExternalId', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  pendingLinkUpdates(
    @Query('profileExternalId') profileExternalId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.jobs.pendingLinkUpdates(
      profileExternalId,
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50,
    );
  }

  @Post('claim/profile/:profileExternalId')
  @ApiOperation({
    summary: 'Réserver des posts avec l’identifiant externe du profil',
  })
  @ApiParam({ name: 'profileExternalId', example: 'demo-profile' })
  @ApiQuery({
    name: 'groupExternalId',
    required: false,
    description:
      'Si absent, un groupe lié ayant des posts disponibles est choisi automatiquement',
  })
  claimByProfileExternalId(
    @Param('profileExternalId') profileExternalId: string,
    @Query('groupExternalId') groupExternalId?: string,
  ) {
    return this.jobs.claimByProfileExternalId(
      profileExternalId,
      groupExternalId,
    );
  }

  @Post(':jobId/posts/:postId/consumed')
  consumed(@Param('jobId') jobId: string, @Param('postId') postId: string) {
    return this.jobs.markConsumed(jobId, postId);
  }

  @Post(':jobId/posts/:postId/published')
  published(
    @Param('jobId') jobId: string,
    @Param('postId') postId: string,
    @Body() dto: PublishJobItemDto,
  ) {
    return this.jobs.markPublished(jobId, postId, dto);
  }

  @Post(':jobId/posts/:postId/failed')
  failed(
    @Param('jobId') jobId: string,
    @Param('postId') postId: string,
    @Body() dto: FailJobItemDto,
  ) {
    return this.jobs.markFailed(jobId, postId, dto.error);
  }

  @Post(':jobId/posts/:postId/commented')
  @ApiOperation({
    summary: 'Enregistrer le commentaire posé sous le post (description seule)',
    description:
      'À appeler après `published`. L’identifiant du commentaire est ' +
      'obligatoire : c’est lui qui permettra d’y placer l’URL ensuite.',
  })
  commented(
    @Param('jobId') jobId: string,
    @Param('postId') postId: string,
    @Body() dto: CommentJobItemDto,
  ) {
    return this.jobs.markCommented(jobId, postId, dto);
  }

  @Post(':jobId/complete')
  @ApiOperation({
    summary: 'Clôturer le lot et ouvrir la phase de bascule des commentaires',
  })
  complete(@Param('jobId') jobId: string) {
    return this.jobs.complete(jobId);
  }

  @Get(':jobId/link-updates')
  @ApiOperation({
    summary: 'URL à placer dans les commentaires de ce job, une fois clôturé',
  })
  linkUpdates(@Param('jobId') jobId: string) {
    return this.jobs.linkUpdates(jobId);
  }

  @Post(':jobId/posts/:postId/link-updated')
  @ApiOperation({
    summary: 'Confirmer que le commentaire porte désormais l’URL',
  })
  linkUpdated(
    @Param('jobId') jobId: string,
    @Param('postId') postId: string,
    @Body() dto: LinkUpdatedJobItemDto,
  ) {
    return this.jobs.markLinkUpdated(jobId, postId, dto);
  }
}
