"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RepeatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepeatService = exports.REPEAT_LIMITS = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
exports.REPEAT_LIMITS = { maxTimes: 30, minHours: 1, maxHours: 24 * 90 };
const DEFAULT_INTERVAL_MINUTES = 5;
let RepeatService = RepeatService_1 = class RepeatService {
    prisma;
    config;
    logger = new common_1.Logger(RepeatService_1.name);
    timer;
    running = false;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    onModuleInit() {
        const raw = Number(this.config.get('REPEAT_CHECK_INTERVAL_MINUTES') ?? DEFAULT_INTERVAL_MINUTES);
        const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INTERVAL_MINUTES;
        if (!minutes)
            return;
        this.timer = setInterval(() => void this.requeueDue().catch((e) => this.logger.warn(String(e))), minutes * 60_000);
        this.timer.unref?.();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async requeueDue(now = new Date()) {
        if (this.running)
            return [];
        this.running = true;
        try {
            return await this.prisma.$transaction(async (tx) => {
                const due = await tx.$queryRaw(client_1.Prisma.sql `
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
            forced_profile_id = NULL, forced_at = NULL, avoid_profile_id = NULL,
            updated_at = ${now}
          FROM due
          WHERE t.id = due.id
          RETURNING t.id, t.post_id AS "postId", t.group_id AS "groupId", t.repeat_round AS round,
            due.times, due."facebookUrl", due.title, due."groupName"
        `);
                if (!due.length)
                    return due;
                const detail = (d) => `publication ${d.round + 1} sur ${d.times}`;
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
                        level: 'INFO',
                        message: `« ${d.title} » repart dans « ${d.groupName} » (${detail(d)})`,
                        metadata: { round: d.round, times: d.times },
                    })),
                });
                return due;
            });
        }
        finally {
            this.running = false;
        }
    }
};
exports.RepeatService = RepeatService;
exports.RepeatService = RepeatService = RepeatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], RepeatService);
//# sourceMappingURL=repeat.service.js.map