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
exports.SessionService = exports.IDLE_MINUTES = exports.SESSION_HOURS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
exports.SESSION_HOURS = 12;
exports.IDLE_MINUTES = 120;
const TOUCH_SECONDS = 60;
const hash = (token) => (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
let SessionService = class SessionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, meta, now = new Date()) {
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const expiresAt = new Date(now.getTime() + exports.SESSION_HOURS * 3_600_000);
        await this.prisma.session.create({
            data: {
                userId,
                tokenHash: hash(token),
                expiresAt,
                lastSeenAt: now,
                ip: meta.ip ?? null,
                userAgent: meta.userAgent?.slice(0, 300) ?? null,
            },
        });
        return { token, expiresAt, maxAgeSeconds: exports.SESSION_HOURS * 3600 };
    }
    async validate(token, now = new Date()) {
        if (!token || token.length > 200)
            return null;
        const session = await this.prisma.session.findUnique({
            where: { tokenHash: hash(token) },
            include: { user: true },
        });
        if (!session || session.revokedAt)
            return null;
        if (session.expiresAt.getTime() <= now.getTime())
            return null;
        if (now.getTime() - session.lastSeenAt.getTime() > exports.IDLE_MINUTES * 60_000) {
            await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } });
            return null;
        }
        if (session.user.status !== client_1.RecordStatus.ACTIVE)
            return null;
        if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_SECONDS * 1000) {
            await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
        }
        return { sessionId: session.id, user: session.user };
    }
    async revoke(token, now = new Date()) {
        if (!token)
            return;
        await this.prisma.session.updateMany({
            where: { tokenHash: hash(token), revokedAt: null },
            data: { revokedAt: now },
        });
    }
    async revokeAll(userId, now = new Date()) {
        const { count } = await this.prisma.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
        });
        return count;
    }
    async purge(now = new Date()) {
        const before = new Date(now.getTime() - 86_400_000);
        await this.prisma.session.deleteMany({
            where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
        });
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionService);
//# sourceMappingURL=session.service.js.map