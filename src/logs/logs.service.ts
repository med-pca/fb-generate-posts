import { Injectable } from '@nestjs/common';
import { JobStatus, LogLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';
import { QueryLogsDto } from './dto/query-logs.dto';
import { LogsSummaryDto } from './dto/logs-summary.dto';
import { paginated } from '../common/paginated';

/** Événements qui appellent une vérification manuelle même sans niveau ERROR.
 * `CLAIM_LOST` signale un post peut-être publié sans trace en base : il ne doit
 * jamais être republié à l'aveugle. `COMMENT_MISSING` signale un post en ligne
 * sans commentaire : son URL ne pourra jamais être posée. */
const INCIDENT_EVENT_TYPES = ['CLAIM_LOST', 'COMMENT_MISSING'];
const INCIDENT_SAMPLE = 20;

const WITH_CONTEXT = {
  profile: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  post: { select: { id: true, title: true } },
} as const;

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLogDto) {
    return this.prisma.activityLog.create({
      data: { ...dto, metadata: dto.metadata as Prisma.InputJsonValue },
    });
  }

  findAll(profileId?: string) {
    return this.prisma.activityLog.findMany({
      where: profileId ? { profileId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Lecture filtrée et paginée, avec le nom du profil, du groupe et du post :
   * un identifiant seul ne permet de décider de rien. */
  async search({ page, limit, ...filters }: QueryLogsDto) {
    const where = this.buildWhere(filters);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        include: WITH_CONTEXT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  /** Ce qu'il faut regarder avant d'agir : le volume par niveau, les
   * événements dominants, les profils qui échouent et les incidents ouverts. */
  async summary({ hours, profileId }: LogsSummaryDto) {
    const since = new Date(Date.now() - hours * 3_600_000);
    const where: Prisma.ActivityLogWhereInput = {
      createdAt: { gte: since },
      ...(profileId ? { profileId } : {}),
    };
    const incidentWhere: Prisma.ActivityLogWhereInput = {
      ...where,
      OR: [
        { level: LogLevel.ERROR },
        { eventType: { in: INCIDENT_EVENT_TYPES } },
      ],
    };

    const [byEvent, byProfile, incidents, total] = await Promise.all([
      this.prisma.activityLog.groupBy({
        by: ['eventType', 'level'],
        where,
        _count: { _all: true },
      }),
      this.prisma.activityLog.groupBy({
        by: ['profileId', 'level'],
        where,
        _count: { _all: true },
      }),
      this.prisma.activityLog.findMany({
        where: incidentWhere,
        include: WITH_CONTEXT,
        orderBy: { createdAt: 'desc' },
        take: INCIDENT_SAMPLE,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    const levels = this.emptyLevels();
    for (const row of byEvent) levels[row.level] += row._count._all;

    return {
      // Hors fenêtre : un commentaire qui attend son URL depuis trois jours
      // doit rester visible même en regardant les dernières 24 h.
      pendingLinkUpdates: await this.pendingLinkStock(profileId),
      since,
      hours,
      total,
      levels,
      // Le compteur qui décide d'une intervention manuelle.
      claimLost: byEvent
        .filter((row) => INCIDENT_EVENT_TYPES.includes(row.eventType))
        .reduce((sum, row) => sum + row._count._all, 0),
      eventTypes: this.foldEventTypes(byEvent),
      profiles: await this.foldProfiles(byProfile),
      incidents,
      incidentsTruncated: incidents.length === INCIDENT_SAMPLE,
    };
  }

  private foldEventTypes(
    rows: Array<{
      eventType: string;
      level: LogLevel;
      _count: { _all: number };
    }>,
  ) {
    const byType = new Map<
      string,
      { eventType: string; total: number; errors: number }
    >();
    for (const row of rows) {
      const entry = byType.get(row.eventType) ?? {
        eventType: row.eventType,
        total: 0,
        errors: 0,
      };
      entry.total += row._count._all;
      if (row.level === LogLevel.ERROR) entry.errors += row._count._all;
      byType.set(row.eventType, entry);
    }
    return [...byType.values()].sort((a, b) => b.total - a.total);
  }

  /** Les identifiants de profil sont remplacés par leur nom : c'est le profil
   * qu'on met en pause, pas un cuid. */
  private async foldProfiles(
    rows: Array<{
      profileId: string | null;
      level: LogLevel;
      _count: { _all: number };
    }>,
  ) {
    const ids = [
      ...new Set(rows.map((row) => row.profileId).filter((id) => id !== null)),
    ];
    const profiles = ids.length
      ? await this.prisma.profile.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, status: true },
        })
      : [];
    const names = new Map(profiles.map((p) => [p.id, p]));

    const byProfile = new Map<
      string,
      {
        profileId: string | null;
        name: string;
        status: string | null;
        total: number;
        errors: number;
      }
    >();
    for (const row of rows) {
      const key = row.profileId ?? '';
      const profile = row.profileId ? names.get(row.profileId) : undefined;
      const entry = byProfile.get(key) ?? {
        profileId: row.profileId,
        name: profile?.name ?? 'Hors profil',
        status: profile?.status ?? null,
        total: 0,
        errors: 0,
      };
      entry.total += row._count._all;
      if (row.level === LogLevel.ERROR) entry.errors += row._count._all;
      byProfile.set(key, entry);
    }
    return [...byProfile.values()].sort(
      (a, b) => b.errors - a.errors || b.total - a.total,
    );
  }

  /** Commentaires posés dont le lien n'a jamais été placé. C'est l'angle mort
   * du nouveau parcours : le post est en ligne, mais l'URL n'y est pas. */
  private async pendingLinkStock(profileId?: string) {
    // Un job encore réservé n'est pas en retard ; tous les autres états, y
    // compris EXPIRED, peuvent cacher un commentaire privé de son URL.
    const job = {
      status: { not: JobStatus.CLAIMED },
      ...(profileId ? { profileId } : {}),
    };
    const [total, oldest] = await Promise.all([
      this.prisma.publicationJobItem.count({
        where: {
          status: 'PUBLISHED',
          commentedAt: { not: null },
          linkUpdatedAt: null,
          post: { url: { not: null } },
          job,
        },
      }),
      this.prisma.publicationJob.findFirst({
        where: {
          ...job,
          items: {
            some: {
              status: 'PUBLISHED',
              commentedAt: { not: null },
              linkUpdatedAt: null,
              post: { url: { not: null } },
            },
          },
        },
        orderBy: { completedAt: 'asc' },
        select: { id: true, completedAt: true },
      }),
    ]);
    return {
      total,
      oldestJobId: oldest?.id ?? null,
      pendingSince: oldest?.completedAt ?? null,
    };
  }

  private emptyLevels(): Record<LogLevel, number> {
    return { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
  }

  private buildWhere(
    filters: Omit<QueryLogsDto, 'page' | 'limit'>,
  ): Prisma.ActivityLogWhereInput {
    const where: Prisma.ActivityLogWhereInput = {};
    if (filters.level) where.level = filters.level;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.profileId) where.profileId = filters.profileId;
    if (filters.groupId) where.groupId = filters.groupId;
    if (filters.postId) where.postId = filters.postId;
    if (filters.jobId) where.jobId = filters.jobId;
    if (filters.since || filters.until) {
      where.createdAt = {
        ...(filters.since ? { gte: new Date(filters.since) } : {}),
        ...(filters.until ? { lte: new Date(filters.until) } : {}),
      };
    }
    if (filters.search?.trim()) {
      where.message = { contains: filters.search.trim(), mode: 'insensitive' };
    }
    if (filters.onlyIncidents) {
      where.OR = [
        { level: LogLevel.ERROR },
        { eventType: { in: INCIDENT_EVENT_TYPES } },
      ];
    }
    return where;
  }
}
