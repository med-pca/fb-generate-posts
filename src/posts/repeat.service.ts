import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Bornes de la duplication : au plus 30 publications d'un même post dans
 * un groupe, au moins une heure d'écart entre deux. */
export const REPEAT_LIMITS = { maxTimes: 30, minHours: 1, maxHours: 24 * 90 };

const DEFAULT_INTERVAL_MINUTES = 5;

type Due = {
  id: string;
  postId: string;
  groupId: string;
  facebookUrl: string | null;
  round: number;
  times: number;
  title: string;
  groupName: string;
};

/** La duplication des contenus : un post publié dans un groupe y repart
 * quand l'écart est écoulé, tant qu'il n'a pas atteint son nombre de
 * publications (le sien, sinon le réglage global ; 1 par défaut = jamais).
 *
 * Remettre la cible dans la file suffit : la réservation, la publication, le
 * commentaire et la vérification se font comme pour la première fois. Les
 * adresses des publications précédentes restent dans l'historique. */
@Injectable()
export class RepeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RepeatService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const raw = Number(this.config.get<string>('REPEAT_CHECK_INTERVAL_MINUTES') ?? DEFAULT_INTERVAL_MINUTES);
    const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INTERVAL_MINUTES;
    if (!minutes) return;
    this.timer = setInterval(() => void this.requeueDue().catch((e) => this.logger.warn(String(e))), minutes * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Remet dans la file les publications dont l'écart est écoulé. Une seule
   * requête : la condition (règle du post ou globale) se lit en base, et deux
   * passages simultanés ne remettent pas deux fois la même cible. */
  async requeueDue(now = new Date()): Promise<Due[]> {
    if (this.running) return [];
    this.running = true;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const due = await tx.$queryRaw<Due[]>(Prisma.sql`
          WITH s AS (
            SELECT repeat_times, repeat_every_hours FROM automation_settings WHERE id = 'global'
          ), due AS (
            SELECT pt.id,
              COALESCE(p.repeat_times, s.repeat_times, 1) AS times,
              pt.facebook_url AS "facebookUrl", p.title, g.name AS "groupName"
            FROM post_targets pt
            INNER JOIN posts p ON p.id = pt.post_id
            INNER JOIN groups g ON g.id = pt.group_id
            LEFT JOIN s ON TRUE
            WHERE pt.status = 'PUBLISHED'::"TargetStatus"
              AND p.status = 'AVAILABLE'::"PostStatus"
              AND g.status = 'ACTIVE'::"RecordStatus"
              AND pt.published_at IS NOT NULL
              AND pt.repeat_round + 1 < COALESCE(p.repeat_times, s.repeat_times, 1)
              AND pt.published_at + make_interval(hours => COALESCE(p.repeat_every_hours, s.repeat_every_hours, 48)) <= ${now}
            FOR UPDATE OF pt SKIP LOCKED
          )
          UPDATE post_targets t SET
            status = 'AVAILABLE'::"TargetStatus",
            repeat_round = t.repeat_round + 1,
            claimed_at = NULL, claim_expires_at = NULL, consumed_at = NULL,
            published_at = NULL, comment_external_id = NULL, commented_at = NULL,
            link_updated_at = NULL, facebook_url = NULL, last_error = NULL,
            verify_status = NULL, verified_at = NULL, verify_detail = NULL,
            verify_claimed_until = NULL, verify_attempts = 0, republish_count = 0,
            forced_profile_id = NULL, forced_at = NULL,
            updated_at = ${now}
          FROM due
          WHERE t.id = due.id
          RETURNING t.id, t.post_id AS "postId", t.group_id AS "groupId", t.repeat_round AS round,
            due.times, due."facebookUrl", due.title, due."groupName"
        `);
        if (!due.length) return due;
        const detail = (d: Due) => `publication ${d.round + 1} sur ${d.times}`;
        await tx.publicationTrace.createMany({
          data: due.map((d) => ({
            postTargetId: d.id,
            kind: 'REPEAT_QUEUED',
            facebookUrl: d.facebookUrl,
            actor: 'Duplication',
            detail: detail(d),
          })),
        });
        await tx.activityLog.createMany({
          data: due.map((d) => ({
            postId: d.postId,
            groupId: d.groupId,
            postTargetId: d.id,
            facebookUrl: d.facebookUrl,
            eventType: 'POST_REPEAT_QUEUED',
            level: 'INFO' as const,
            message: `« ${d.title} » repart dans « ${d.groupName} » (${detail(d)})`,
            metadata: { round: d.round, times: d.times },
          })),
        });
        return due;
      });
    } finally {
      this.running = false;
    }
  }
}
