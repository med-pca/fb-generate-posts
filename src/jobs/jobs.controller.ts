import { Body, Controller, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { ClaimJobDto } from './dto/claim-job.dto';
import { FailJobItemDto } from './dto/fail-job-item.dto';
import { PublishJobItemDto } from './dto/publish-job-item.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('claim')
  claim(@Body() dto: ClaimJobDto) {
    return this.jobs.claim(dto);
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

  @Post(':jobId/complete')
  complete(@Param('jobId') jobId: string) {
    return this.jobs.complete(jobId);
  }
}
