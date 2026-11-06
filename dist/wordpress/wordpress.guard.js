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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const digest = (value) => (0, node_crypto_1.createHmac)('sha256', 'wordpress').update(value).digest();
const same = (a, b) => Boolean(a && b) && (0, node_crypto_1.timingSafeEqual)(digest(a), digest(b));
let WordpressGuard = class WordpressGuard {
    config;
    prisma;
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
    }
    globalKey() {
        const allowed = String(this.config.get('WORDPRESS_ALLOW_GLOBAL_KEY') ?? 'true').toLowerCase() !== 'false';
        return allowed ? this.config.get('WORDPRESS_API_KEY') || '' : '';
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const provided = String(request.headers['x-api-key'] || '');
        if (!this.prisma) {
            const expected = this.globalKey();
            if (!expected)
                throw new common_1.ServiceUnavailableException('WORDPRESS_API_KEY doit être configuré');
            if (same(provided, expected))
                return true;
            throw new common_1.UnauthorizedException('Clé WordPress invalide');
        }
        if (!provided)
            throw new common_1.UnauthorizedException('Clé WordPress invalide');
        return this.siteKeyMatches(request, provided);
    }
    async siteKeyMatches(request, provided) {
        const raw = request.body?.siteUrl;
        let origin = '';
        try {
            const url = new URL(String(raw ?? ''));
            origin = url.origin + url.pathname.replace(/\/+$/, '');
        }
        catch {
            throw new common_1.UnauthorizedException('Clé WordPress invalide');
        }
        const site = await this.prisma.contentSource.findUnique({
            where: { originUrl: origin },
            select: { depositKey: true },
        });
        if (!site) {
            throw new common_1.UnauthorizedException(`Site inconnu (${origin}) : déclarez-le dans la plateforme (Sites), puis collez sa clé dans le plugin`);
        }
        if (site.depositKey) {
            if (same(provided, site.depositKey))
                return true;
            throw new common_1.UnauthorizedException('Clé WordPress invalide pour ce site');
        }
        const global = this.globalKey();
        if (global && same(provided, global))
            return true;
        throw new common_1.UnauthorizedException('Ce site n’a pas encore sa clé : générez-la dans la plateforme (Sites), puis collez-la dans le plugin');
    }
};
exports.WordpressGuard = WordpressGuard;
exports.WordpressGuard = WordpressGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], WordpressGuard);
//# sourceMappingURL=wordpress.guard.js.map