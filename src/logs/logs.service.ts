import { Injectable } from '@nestjs/common';
import { JobStatus, LogLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeFacebookUrl } from '../trace/trace';
import { CreateLogDto } from './dto/create-log.dto';
import { QueryLogsDto } from './dto/query-logs.dto';
import { LogsSummaryDto } from './dto/logs-summary.dto';
import { paginated } from '../common/paginated';
import type { CurrentUser } from '../auth/current-user';
import { logWhere, scopeOf, seesEverything } from '../auth/scope';
import {
  domainOf,
  domainWhere,
  LOG_DOMAIN_KEYS,
  LOG_DOMAINS,
} from './domains';
import type { LogDomain } from './domains';

/** Événements qui appellent une vérification manuelle même sans niveau ERROR.
 * `CLAIM_LOST` signale un post peut-être publié sans trace en base : il ne doit
 * jamais être republié à l'aveugle. `COMMENT_MISSING` signale un post en ligne
 * sans commentaire : son URL ne pourra jamais être posée. */
const INCIDENT_EVENT_TYPES = ['CLAIM_LOST', 'COMMENT_MISSING'];
const INCIDENT_SAMPLE = 20;

const WITH_CONTEXT = {
  profile: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, url: true, category: { select: { id: true, name: true } } } },
  post: { select: { id: true, title: true, url: true } },
} as const;

/** Au-delà, l'export est coupé : de quoi suivre une semaine chargée. */
const EXPORT_LIMIT = 5000;
const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLogDto) {
    return this.prisma.activityLog.create({
      data: {
        ...dto,
        // Même forme que partout ailleurs, pour que le filtre par lien trouve.
        facebookUrl: dto.facebookUrl ? (normalizeFacebookUrl(dto.facebookUrl) ?? dto.facebookUrl) : undefined,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });
  }

  findAll(profileId: string | undefined, acting: CurrentUser | null) {
    return this.prisma.activityLog.findMany({
      where: this.scoped(profileId ? { profileId } : {}, acting),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Lecture filtrée et paginée, avec le nom du profil, du groupe et du post :
   * un identifiant seul ne permet de décider de rien. */
  async search(
    { page, limit, ...filters }: QueryLogsDto,
    acting: CurrentUser | null,
  ) {
    const where = this.scoped(this.buildWhere(filters), acting);
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
    // Le domaine de chaque ligne, calculé ici une seule fois : l'interface
    // n'a pas à recopier les règles de rangement.
    return paginated(
      data.map((log) => ({ ...log, domain: domainOf(log.eventType) })),
      total,
      page,
      limit,
    );
  }

  /** Les journaux filtrés, en CSV (séparateur « ; », lisible par Excel) :
   * pour suivre une période, partager un incident, garder une trace. */
  async exportCsv({ page, limit, ...filters }: QueryLogsDto, acting: CurrentUser | null) {
    void page;
    void limit;
    const rows = await this.prisma.activityLog.findMany({
      where: this.scoped(this.buildWhere(filters), acting),
      include: WITH_CONTEXT,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    const header = ['date', 'niveau', 'domaine', 'événement', 'message', 'profil', 'groupe', 'catégorie', 'post', 'lien facebook', 'url article', 'publication', 'lot'];
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.level,
        domainOf(r.eventType),
        r.eventType,
        r.message,
        r.profile?.name,
        r.group?.name,
        r.group?.category?.name,
        r.post?.title,
        r.facebookUrl,
        r.post?.url,
        r.postTargetId,
        r.jobId,
      ]
        .map(csvCell)
        .join(';'),
    );
    // BOM : Excel lit alors les accents et l'arabe correctement.
    return '\ufeff' + [header.join(';'), ...lines].join('\r\n');
  }

  /** Ce qu'il faut regarder avant d'agir : le volume par niveau, les
   * événements dominants, les profils qui échouent et les incidents ouverts. */
  async summary(
    { hours, profileId, domain }: LogsSummaryDto,
    acting: CurrentUser | null,
  ) {
    const since = new Date(Date.now() - hours * 3_600_000);
    const window = this.scoped(
      { createdAt: { gte: since }, ...(profileId ? { profileId } : {}) },
      acting,
    );
    const where: Prisma.ActivityLogWhereInput = domain
      ? { AND: [window, domainWhere(domain)] }
      : window;
    const incidentWhere: Prisma.ActivityLogWhereInput = {
      AND: [
        where,
        {
          OR: [
            { level: LogLevel.ERROR },
            { eventType: { in: INCIDENT_EVENT_TYPES } },
          ],
        },
      ],
    };

    const [allEvents, byEvent, byProfile, incidents, total] = await Promise.all([
      // Tous domaines confondus : de quoi afficher le compte de chaque onglet.
      this.prisma.activityLog.groupBy({
        by: ['eventType', 'level'],
        where: window,
        _count: { _all: true },
      }),
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
      domain: domain ?? null,
      domains: this.foldDomains(allEvents),
      profiles: await this.foldProfiles(byProfile),
      incidents,
      incidentsTruncated: incidents.length === INCIDENT_SAMPLE,
    };
  }

  /** Par domaine : volume, erreurs et avertissements — ce que les onglets
   * affichent pour dire où regarder d'abord. */
  private foldDomains(
    rows: Array<{
      eventType: string;
      level: LogLevel;
      _count: { _all: number };
    }>,
  ) {
    const totals = new Map<
      LogDomain,
      { domain: LogDomain; label: string; total: number; errors: number; warns: number }
    >(
      LOG_DOMAIN_KEYS.map((key) => [
        key,
        {
          domain: key,
          label: key === 'other' ? 'Autres' : LOG_DOMAINS[key].label,
          total: 0,
          errors: 0,
          warns: 0,
        },
      ]),
    );
    for (const row of rows) {
      const entry = totals.get(domainOf(row.eventType))!;
      entry.total += row._count._all;
      if (row.level === LogLevel.ERROR) entry.errors += row._count._all;
      if (row.level === LogLevel.WARN) entry.warns += row._count._all;
    }
    return [...totals.values()];
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
    return [...byType.values()]
      .map((entry) => ({ ...entry, domain: domainOf(entry.eventType) }))
      .sort((a, b) => b.total - a.total);
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

  /** Combine la portée et les filtres par `AND`.
   *
   * Les deux se servent de `OR` — la recherche d'un côté, « mon profil ou
   * mon groupe » de l'autre. Les fusionner à plat ferait disparaître l'un
   * des deux, et c'est la portée qu'on perdrait. */
  private scoped(
    where: Prisma.ActivityLogWhereInput,
    acting: CurrentUser | null,
  ): Prisma.ActivityLogWhereInput {
    const scope = scopeOf(acting);
    return seesEverything(scope) ? where : { AND: [where, logWhere(scope)] };
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
    if (filters.postTargetId) where.postTargetId = filters.postTargetId;
    if (filters.categoryId) where.group = { categoryId: filters.categoryId };
    const and: Prisma.ActivityLogWhereInput[] = filters.domain ? [domainWhere(filters.domain)] : [];
    if (filters.facebookUrl?.trim()) {
      // Un lien collé tel quel, ou un morceau (le numéro du post) : on
      // compare sur la forme enregistrée, puis par inclusion.
      const raw = filters.facebookUrl.trim();
      const normalized = normalizeFacebookUrl(raw);
      and.push({
        OR: [
          ...(normalized ? [{ facebookUrl: normalized }] : []),
          { facebookUrl: { contains: normalized ?? raw, mode: 'insensitive' } },
          { message: { contains: raw, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.withUrl) and.push({ facebookUrl: { not: null } });
    if (filters.since || filters.until) {
      where.createdAt = {
        ...(filters.since ? { gte: new Date(filters.since) } : {}),
        ...(filters.until ? { lte: new Date(filters.until) } : {}),
      };
    }
    if (filters.search?.trim()) {
      const text = filters.search.trim();
      and.push({
        OR: [
          { message: { contains: text, mode: 'insensitive' } },
          { eventType: { contains: text, mode: 'insensitive' } },
          { facebookUrl: { contains: text, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.onlyIncidents) {
      and.push({
        OR: [
          { level: LogLevel.ERROR },
          { eventType: { in: INCIDENT_EVENT_TYPES } },
        ],
      });
    }
    if (and.length) where.AND = and;
    return where;
  }
}
