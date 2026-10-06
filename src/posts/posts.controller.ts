import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ActingUser } from '../auth/current-user';
import type { CurrentUser } from '../auth/current-user';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
import { BulkRepeatDto } from './dto/repeat.dto';
import {
  FacebookUrlDto,
  ForceTargetDto,
  OptionalFacebookUrlDto,
  PriorityDto,
  QueueQueryDto,
} from './dto/queue.dto';
import { QueueService } from './queue.service';
import { PublishedService } from './published.service';
import { PrioritiesService } from './priorities.service';
import { GroupLimitsDto, PublishedQueryDto } from './dto/queue.dto';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly queueService: QueueService,
    private readonly publishedService: PublishedService,
    private readonly priorities: PrioritiesService,
  ) {}

  @Get('priorities')
  @ApiOperation({ summary: 'Règles & priorités du pilotage : groupes et articles, avec ce qui attend dans la file' })
  prioritiesOverview(@ActingUser() acting: CurrentUser) {
    return this.priorities.overview(acting);
  }

  @Patch('priorities/groups/:id')
  @ApiOperation({ summary: 'Priorité d’un groupe (en tête, monter, descendre, remettre à zéro, ou une valeur)' })
  groupPriority(@Param('id') id: string, @Body() dto: PriorityDto, @ActingUser() acting: CurrentUser) {
    return this.priorities.setGroup(id, dto, acting);
  }

  @Patch('priorities/groups/:id/limits')
  @ApiOperation({ summary: 'Plafond de posts par jour et heures de publication d’un groupe (null = aucun)' })
  groupLimits(@Param('id') id: string, @Body() dto: GroupLimitsDto, @ActingUser() acting: CurrentUser) {
    return this.priorities.setGroupLimits(id, dto, acting);
  }

  @Patch('priorities/articles/:id')
  @ApiOperation({ summary: 'Priorité d’un article : appliquée à tous ses posts encore à publier' })
  articlePriority(@Param('id') id: string, @Body() dto: PriorityDto, @ActingUser() acting: CurrentUser) {
    return this.priorities.setArticle(id, dto, acting);
  }

  // Avant `:id` : « published » serait pris pour un identifiant.
  @Get('published')
  @ApiOperation({ summary: 'Audit des publications faites : période (date-heure), profil, groupe, vérification, lien… avec les totaux' })
  published(@Query() query: PublishedQueryDto, @ActingUser() acting: CurrentUser) {
    return this.publishedService.audit(query, acting);
  }

  @Get('published.csv')
  @ApiOperation({ summary: 'Le même audit en CSV' })
  async publishedCsv(@Query() query: PublishedQueryDto, @ActingUser() acting: CurrentUser, @Res() reply: FastifyReply) {
    const body = await this.publishedService.csv(query, acting);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="publications-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(body);
  }

  // Avant `:id` : sinon « queue » serait pris pour un identifiant.
  @Get('queue')
  @ApiOperation({
    summary: 'La file de publication',
    description:
      'En cours (réservées par un automate), à venir (dans l’ordre exact de ' +
      'réservation : priorité puis ancienneté) et publiées (quand, dans quel ' +
      'groupe, par quel profil). Filtrable par catégorie ou groupe.',
  })
  queue(@Query() query: QueueQueryDto, @ActingUser() acting: CurrentUser) {
    return this.queueService.queue(query, acting);
  }

  @Post('targets/:targetId/retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Relancer une publication en échec dans son groupe',
  })
  retry(
    @Param('targetId') targetId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.queueService.retry(targetId, acting);
  }

  @Post('targets/:targetId/published')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Marquer « déjà en ligne » une publication en échec',
    description:
      'Quand le post est bien sur Facebook mais que l’extension ne l’a pas ' +
      'retrouvé : l’enregistre comme publié, sans le republier.',
  })
  markPublished(
    @Param('targetId') targetId: string,
    @Body() dto: OptionalFacebookUrlDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.queueService.markPublished(targetId, acting, dto?.facebookUrl);
  }

  @Put('targets/:targetId/facebook-url')
  @ApiOperation({
    summary: 'Enregistrer l’adresse Facebook d’une publication',
    description: 'Celle que l’extension n’a pas retrouvée, ou une correction. L’ancienne reste dans l’historique.',
  })
  setFacebookUrl(
    @Param('targetId') targetId: string,
    @Body() dto: FacebookUrlDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.queueService.setFacebookUrl(targetId, dto.facebookUrl, acting);
  }

  @Get('targets/:targetId/history')
  @ApiOperation({ summary: 'Historique d’une publication : tentatives, adresses, vérifications' })
  history(@Param('targetId') targetId: string, @ActingUser() acting: CurrentUser) {
    return this.queueService.history(targetId, acting);
  }

  @Get('targets-by-url')
  @ApiOperation({ summary: 'Retrouver une publication à partir de son adresse Facebook' })
  findByUrl(@Query('url') url: string, @ActingUser() acting: CurrentUser) {
    return this.queueService.findByUrl(url ?? '', acting);
  }

  @Delete('targets/:targetId')
  @ApiOperation({
    summary: 'Retirer un post d’un seul groupe',
    description:
      'Le post reste dans ses autres groupes ; s’il ne visait que celui-ci, il ' +
      'est supprimé. Une publication faite ou en cours ne se retire pas.',
  })
  removeTarget(
    @Param('targetId') targetId: string,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.queueService.removeTarget(targetId, acting);
  }

  @Put('targets/:targetId/force')
  @ApiOperation({
    summary: 'Faire publier par un profil précis, au plus tôt',
    description:
      'Le profil la prend en premier à son prochain passage ; aucun autre ne ' +
      'la prend entre-temps. `profileId: null` la rend à la file.',
  })
  force(
    @Param('targetId') targetId: string,
    @Body() dto: ForceTargetDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.queueService.force(targetId, dto.profileId ?? null, acting);
  }

  @Patch(':id/priority')
  @ApiOperation({
    summary: 'Prioriser un post',
    description:
      '`move`: top (en tête de file), up, down, reset — ou `priority` exacte. ' +
      'Le post passe en tête dans tous ses groupes.',
  })
  setPriority(
    @Param('id') id: string,
    @Body() dto: PriorityDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.queueService.setPriority(id, dto, acting);
  }

  @Post()
  create(@Body() dto: CreatePostDto, @ActingUser() acting: CurrentUser) {
    return this.posts.create(dto, acting);
  }

  @Get()
  findAll(@Query() query: QueryPostsDto, @ActingUser() acting: CurrentUser) {
    return this.posts.findAll(query, acting);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Supprimer plusieurs posts par sélection ou par filtre (dryRun pour compter d’abord)',
  })
  bulkRemove(
    @Body() dto: BulkDeletePostsDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.posts.bulkRemove(dto, acting);
  }

  @Post('bulk-repeat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Règle de duplication pour plusieurs posts (null = réglage global)' })
  bulkRepeat(@Body() dto: BulkRepeatDto, @ActingUser() acting: CurrentUser) {
    return this.posts.bulkRepeat(dto, acting);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActingUser() acting: CurrentUser) {
    return this.posts.findOne(id, acting);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @ActingUser() acting: CurrentUser,
  ) {
    return this.posts.update(id, dto, acting);
  }

  @Delete(':id')
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(
    @Param('id') id: string,
    @ActingUser() acting: CurrentUser,
    @Query('force') force?: string,
  ) {
    return this.posts.remove(id, force === 'true', acting);
  }
}
