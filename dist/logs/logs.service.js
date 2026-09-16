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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
const INCIDENT_EVENT_TYPES = ['CLAIM_LOST', 'COMMENT_MISSING'];
const INCIDENT_SAMPLE = 20;
const WITH_CONTEXT = {
    profile: { select: { id: true, name: true } },
    group: { select: { id: true, name: true } },
    post: { select: { id: true, title: true } },
};
let LogsService = class LogsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    create(dto) {
        return this.prisma.activityLog.create({
            data: { ...dto, metadata: dto.metadata },
        });
    }
    findAll(profileId) {
        return this.prisma.activityLog.findMany({
            where: profileId ? { profileId } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }
    async search({ page, limit, ...filters }) {
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
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    async summary({ hours, profileId }) {
        const since = new Date(Date.now() - hours * 3_600_000);
        const where = {
            createdAt: { gte: since },
            ...(profileId ? { profileId } : {}),
        };
        const incidentWhere = {
            ...where,
            OR: [
                { level: client_1.LogLevel.ERROR },
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
        for (const row of byEvent)
            levels[row.level] += row._count._all;
        return {
            pendingLinkUpdates: await this.pendingLinkStock(profileId),
            since,
            hours,
            total,
            levels,
            claimLost: byEvent
                .filter((row) => INCIDENT_EVENT_TYPES.includes(row.eventType))
                .reduce((sum, row) => sum + row._count._all, 0),
            eventTypes: this.foldEventTypes(byEvent),
            profiles: await this.foldProfiles(byProfile),
            incidents,
            incidentsTruncated: incidents.length === INCIDENT_SAMPLE,
        };
    }
    foldEventTypes(rows) {
        const byType = new Map();
        for (const row of rows) {
            const entry = byType.get(row.eventType) ?? {
                eventType: row.eventType,
                total: 0,
                errors: 0,
            };
            entry.total += row._count._all;
            if (row.level === client_1.LogLevel.ERROR)
                entry.errors += row._count._all;
            byType.set(row.eventType, entry);
        }
        return [...byType.values()].sort((a, b) => b.total - a.total);
    }
    async foldProfiles(rows) {
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
        const byProfile = new Map();
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
            if (row.level === client_1.LogLevel.ERROR)
                entry.errors += row._count._all;
            byProfile.set(key, entry);
        }
        return [...byProfile.values()].sort((a, b) => b.errors - a.errors || b.total - a.total);
    }
    async pendingLinkStock(profileId) {
        const job = {
            status: { not: client_1.JobStatus.CLAIMED },
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
    emptyLevels() {
        return { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
    }
    buildWhere(filters) {
        const where = {};
        if (filters.level)
            where.level = filters.level;
        if (filters.eventType)
            where.eventType = filters.eventType;
        if (filters.profileId)
            where.profileId = filters.profileId;
        if (filters.groupId)
            where.groupId = filters.groupId;
        if (filters.postId)
            where.postId = filters.postId;
        if (filters.jobId)
            where.jobId = filters.jobId;
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
                { level: client_1.LogLevel.ERROR },
                { eventType: { in: INCIDENT_EVENT_TYPES } },
            ];
        }
        return where;
    }
};
exports.LogsService = LogsService;
exports.LogsService = LogsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LogsService);
//# sourceMappingURL=logs.service.js.map