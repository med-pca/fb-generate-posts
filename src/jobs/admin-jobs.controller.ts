import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { JobsService } from './jobs.service';

/** Les gestes de l'admin sur un lot, depuis la file d'attente. */
@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post(':jobId/release')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Libérer un lot bloqué (admin)',
    description:
      'Ses posts pas encore commencés retournent dans la file et le profil ' +
      'peut réserver à nouveau. Un post en cours de publication est laissé ' +
      'tel quel, pour ne pas le publier deux fois.',
  })
  release(@Param('jobId') jobId: string, @ActingUser() acting: CurrentUser) {
    return this.jobs.release(jobId, acting, `libéré par ${acting.username}`);
  }
}
