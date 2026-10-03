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
exports.AutomationAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
let AutomationAuthGuard = class AutomationAuthGuard {
    config;
    prisma;
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const provided = String(request.headers['x-api-key'] || '');
        if (!provided) {
            await this.noteBrowserRejected(request, 'aucune clé présentée');
            throw new common_1.UnauthorizedException('Clé d’automatisation invalide');
        }
        const global = this.config.get('AUTOMATION_API_KEY');
        if (global && this.equal(provided, global)) {
            request.user = null;
            return true;
        }
        const user = await this.prisma.user.findUnique({
            where: { automationKey: provided },
        });
        if (!user) {
            await this.noteBrowserRejected(request, 'clé inconnue (régénérée depuis l’appairage ?)');
            if (!global) {
                throw new common_1.ServiceUnavailableException('AUTOMATION_API_KEY doit être configuré, ou une clé de compte présentée');
            }
            throw new common_1.UnauthorizedException('Clé d’automatisation invalide');
        }
        if (user.status !== client_1.RecordStatus.ACTIVE) {
            await this.noteBrowserRejected(request, `compte « ${user.username} » désactivé`);
            throw new common_1.UnauthorizedException('Ce compte est désactivé');
        }
        request.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            status: user.status,
        };
        return true;
    }
    async noteBrowserRejected(request, reason) {
        const match = /\/control\/profile\/([^/?#]+)/.exec(request.url || '');
        if (!match)
            return;
        let externalId;
        try {
            externalId = decodeURIComponent(match[1]);
        }
        catch {
            return;
        }
        try {
            await this.prisma.profileRunner.updateMany({
                where: { profile: { externalId } },
                data: { keyRejectedAt: new Date(), keyRejectReason: reason },
            });
        }
        catch {
        }
    }
    equal(left, right) {
        const a = (0, node_crypto_1.createHmac)('sha256', 'automation').update(left).digest();
        const b = (0, node_crypto_1.createHmac)('sha256', 'automation').update(right).digest();
        return (0, node_crypto_1.timingSafeEqual)(a, b);
    }
};
exports.AutomationAuthGuard = AutomationAuthGuard;
exports.AutomationAuthGuard = AutomationAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], AutomationAuthGuard);
//# sourceMappingURL=automation-auth.guard.js.map