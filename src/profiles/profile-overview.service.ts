import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { profileWhere, scopeOf } from '../auth/scope';
import { ProfileHealthService } from './profile-health.service';
import { HEALTH_LABELS, healthOf, type HealthLabel } from './profile-health';

const DAY = 86_400_000;
/** Un navigateur muet depuis plus longtemps n'est plus « au travail ». */
const SEEN_FRESH_MS = 3 * 60_000;
/** Un profil actif sans publication depuis autant de jours est signalé. */
const IDLE_DAYS = 3;

export type ProfileState = 'working' | 'waiting' | 'off' | 'paused' | 'suspended' | 'checkpoint' | 'logged_out' | 'inactive';

/** L'état d'un profil, en un mot, du plus grave au plus banal. */
export function stateOf(
  p: {
    status: string;
    facebookSuspension: string | null;
    runner: { mode: string; running: boolean; lastSeenAt: Date | null; pausedUntil: Date | null } | null;
  },
  now: Date,
): ProfileState {
  if (p.status !== 'ACTIVE') return 'inactive';
  if (p.facebookSuspension === 'disabled') return 'suspended';
  if (p.facebookSuspension === 'checkpoint') return 'checkpoint';
  if (p.facebookSuspension === 'logged_out') return 'logged_out';
  const r = p.runner;
  if (r?.pausedUntil && r.pausedUntil.getTime() > now.getTime()) return 'paused';
  if (!r || r.mode === 'OFF') return 'off';
  const fresh = r.lastSeenAt && now.getTime() - r.lastSeenAt.getTime() < SEEN_FRESH_MS;
  return r.running && fresh ? 'working' : 'waiting';
}

/** Le jour AAAA-MM-JJ dans le fuseau donné. */
function dayKey(at: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Le tableau de bord de TOUS les profils visibles : leurs états, leur
 * santé, ce qu'ils ont publié, ceux qui marchent le mieux et ceux qui
 * demandent une action. Les modérateurs (vérificateurs) n'y sont pas. */
@Injectable()
export class ProfileOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: ProfileHealthService,
  ) {}

  async overview(acting: CurrentUser | null, days = 14, now = new Date()) {
    const scope = scopeOf(acting);
    const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { objectiveTimezone: true } });
    const timeZone = settings?.objectiveTimezone || 'Europe/Paris';
    const profiles = await this.prisma.profile.findMany({
      where: { ...profileWhere(scope), isModerator: false },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        externalId: true,
        facebookUserId: true,
        facebookName: true,
        facebookProfileUrl: true,
        facebookSuspension: true,
        owner: { select: { id: true, username: true } },
        runner: { select: { mode: true, running: true, lastSeenAt: true, pausedUntil: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ids = profiles.map((p) => p.id);
    const since = new Date(now.getTime() - (days - 1) * DAY);
    const sinceDay = new Date(`${dayKey(since, timeZone)}T00:00:00Z`);
    const todayKey = dayKey(now, timeZone);

    const [perDay, perProfile, joins, healthInputs] = ids.length
      ? await Promise.all([
          this.prisma.$queryRaw<Array<{ day: Date; published: bigint; failed: bigint }>>(Prisma.sql`
            SELECT date_trunc('day', COALESCE(i.published_at, i.updated_at) AT TIME ZONE ${timeZone}) AS day,
              COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus") AS published,
              COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus") AS failed
            FROM publication_job_items i
            INNER JOIN publication_jobs j ON j.id = i.job_id
            WHERE j.profile_id IN (${Prisma.join(ids)})
              AND i.status IN ('PUBLISHED'::"TargetStatus", 'FAILED'::"TargetStatus")
              AND COALESCE(i.published_at, i.updated_at) >= ${sinceDay}
            GROUP BY 1 ORDER BY 1
          `),
          this.prisma.$queryRaw<Array<{ profile_id: string; published: bigint; failed: bigint; today: bigint; last_published: Date | null }>>(Prisma.sql`
            SELECT j.profile_id,
              COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${since}) AS published,
              COUNT(*) FILTER (WHERE i.status = 'FAILED'::"TargetStatus" AND i.updated_at >= ${since}) AS failed,
              COUNT(*) FILTER (WHERE i.status = 'PUBLISHED'::"TargetStatus" AND i.published_at >= ${new Date(now.getTime() - DAY)}) AS today,
              MAX(i.published_at) AS last_published
            FROM publication_job_items i
            INNER JOIN publication_jobs j ON j.id = i.job_id
            WHERE j.profile_id IN (${Prisma.join(ids)})
            GROUP BY j.profile_id
          `),
          this.prisma.profileGroup.groupBy({
            by: ['joinStatus'],
            where: { profileId: { in: ids }, status: 'ACTIVE', group: { status: 'ACTIVE' } },
            _count: { _all: true },
          }),
          this.health.inputs(ids, now),
        ])
      : ([[], [], [], new Map()] as unknown as [
          Array<{ day: Date; published: bigint; failed: bigint }>,
          Array<{ profile_id: string; published: bigint; failed: bigint; today: bigint; last_published: Date | null }>,
          Array<{ joinStatus: string; _count: { _all: number } }>,
          Map<string, never>,
        ]);

    const byProfile = new Map(perProfile.map((r) => [r.profile_id, r]));
    const states: Record<ProfileState, number> = { working: 0, waiting: 0, off: 0, paused: 0, suspended: 0, checkpoint: 0, logged_out: 0, inactive: 0 };
    const health: Record<HealthLabel, number> = { good: 0, watch: 0, bad: 0, new: 0 };
    const rows = profiles.map((p) => {
      const st = stateOf(p, now);
      states[st]++;
      const h = healthOf(healthInputs.get(p.id) ?? { published: 0, failed: 0, verifiedOk: 0, verifiedBad: 0, withLink: 0, linkPlaced: 0, failStreak: 0, claimsLost: 0 });
      health[h.label]++;
      const r = byProfile.get(p.id);
      const published = Number(r?.published ?? 0);
      const failed = Number(r?.failed ?? 0);
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        externalId: p.externalId,
        facebookUserId: p.facebookUserId,
        facebookName: p.facebookName,
        facebookProfileUrl: p.facebookProfileUrl,
        owner: p.owner,
        state: st,
        mode: p.runner?.mode ?? 'OFF',
        health: { score: h.score, label: h.label, labelText: HEALTH_LABELS[h.label], suggestDeactivate: h.suggestDeactivate },
        published,
        failed,
        last24h: Number(r?.today ?? 0),
        successRate: published + failed ? published / (published + failed) : null,
        lastPublishedAt: r?.last_published ?? null,
      };
    });

    // La courbe : un point par jour, même vide.
    const series = new Map<string, { published: number; failed: number }>();
    for (let d = 0; d < days; d++) series.set(dayKey(new Date(since.getTime() + d * DAY), timeZone), { published: 0, failed: 0 });
    for (const r of perDay) {
      const key = r.day.toISOString().slice(0, 10);
      const slot = series.get(key);
      if (slot) {
        slot.published += Number(r.published);
        slot.failed += Number(r.failed);
      }
    }
    const published = rows.reduce((n, r) => n + r.published, 0);
    const failed = rows.reduce((n, r) => n + r.failed, 0);
    const usable = rows.filter((r) => !['inactive', 'suspended', 'checkpoint', 'logged_out'].includes(r.state));
    const idleSince = now.getTime() - IDLE_DAYS * DAY;
    const groupCount = (s: string) => joins.find((j) => j.joinStatus === s)?._count._all ?? 0;

    // Ce qui demande une action, le plus grave d'abord.
    const attention = [
      ...rows.filter((r) => r.state === 'suspended').map((r) => ({ ...pick(r), why: 'Suspendu par Facebook' })),
      ...rows.filter((r) => r.state === 'checkpoint').map((r) => ({ ...pick(r), why: 'Vérification Facebook demandée' })),
      ...rows.filter((r) => r.state === 'logged_out').map((r) => ({ ...pick(r), why: 'Déconnecté de Facebook' })),
      ...rows.filter((r) => r.health.suggestDeactivate && !['suspended', 'checkpoint', 'logged_out', 'inactive'].includes(r.state)).map((r) => ({ ...pick(r), why: 'Santé mauvaise : à désactiver ?' })),
      ...usable
        .filter((r) => r.mode !== 'OFF' && r.state !== 'paused' && (!r.lastPublishedAt || r.lastPublishedAt.getTime() < idleSince) && r.createdAt.getTime() < idleSince)
        .map((r) => ({ ...pick(r), why: r.lastPublishedAt ? `Aucune publication depuis ${IDLE_DAYS} jours ou plus` : 'N’a jamais publié' })),
      ...rows.filter((r) => !r.facebookUserId && !r.facebookProfileUrl && r.state !== 'inactive').map((r) => ({ ...pick(r), why: 'Lien Facebook inconnu (difficile à reconnaître)' })),
    ];

    return {
      days,
      timeZone,
      today: todayKey,
      totals: {
        profiles: rows.length,
        active: rows.filter((r) => r.state !== 'inactive').length,
        usable: usable.length,
        published,
        failed,
        successRate: published + failed ? published / (published + failed) : null,
        last24h: rows.reduce((n, r) => n + r.last24h, 0),
        perUsableProfile: usable.length ? published / usable.length / days : 0,
        withFacebookLink: rows.filter((r) => r.facebookUserId || r.facebookProfileUrl).length,
      },
      states,
      health,
      groups: {
        joined: groupCount('JOINED'),
        requested: groupCount('REQUESTED'),
        pending: groupCount('NOT_JOINED'),
        questions: groupCount('QUESTIONS'),
        failed: groupCount('FAILED'),
      },
      series: [...series.entries()].map(([day, v]) => ({ day, ...v })),
      top: [...rows].filter((r) => r.published).sort((a, b) => b.published - a.published).slice(0, 8).map(pick),
      worst: [...rows]
        .filter((r) => r.failed >= 3)
        .sort((a, b) => (a.successRate ?? 1) - (b.successRate ?? 1))
        .slice(0, 8)
        .map(pick),
      // Un profil, une ligne : ses problèmes réunis, le plus grave d'abord.
      attention: [...groupBy(attention, (a) => a.id).values()].map((list) => ({ ...list[0], why: list.map((a) => a.why).join(' · ') })).slice(0, 40),
      // Pour l'admin : la répartition par compte.
      byOwner: scope
        ? []
        : [...groupBy(rows, (r) => r.owner?.username ?? 'Administration').entries()]
            .map(([owner, list]) => ({
              owner,
              profiles: list.length,
              working: list.filter((r) => r.state === 'working').length,
              outOfService: list.filter((r) => ['suspended', 'checkpoint', 'logged_out'].includes(r.state)).length,
              published: list.reduce((n, r) => n + r.published, 0),
              failed: list.reduce((n, r) => n + r.failed, 0),
            }))
            .sort((a, b) => b.published - a.published),
    };
  }
}

function pick(r: {
  id: string;
  name: string;
  facebookName: string | null;
  facebookUserId: string | null;
  facebookProfileUrl: string | null;
  state: ProfileState;
  published: number;
  failed: number;
  successRate: number | null;
  lastPublishedAt: Date | null;
  health: { score: number | null; label: HealthLabel };
}) {
  return {
    id: r.id,
    name: r.name,
    facebookName: r.facebookName,
    facebookUserId: r.facebookUserId,
    facebookProfileUrl: r.facebookProfileUrl,
    state: r.state,
    published: r.published,
    failed: r.failed,
    successRate: r.successRate,
    lastPublishedAt: r.lastPublishedAt,
    score: r.health.score,
    label: r.health.label,
  };
}

function groupBy<T>(list: T[], key: (t: T) => string) {
  const out = new Map<string, T[]>();
  for (const t of list) out.set(key(t), [...(out.get(key(t)) ?? []), t]);
  return out;
}
