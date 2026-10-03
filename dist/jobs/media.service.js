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
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const safe_fetch_1 = require("../common/safe-fetch");
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
let MediaService = class MediaService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async fetchPostImage(rawUrl) {
        const url = String(rawUrl || '').trim();
        const used = url &&
            ((await this.prisma.post.count({ where: { imageUrl: url } })) ||
                (await this.prisma.profile.count({ where: { defaultImageUrl: url } })));
        if (!used) {
            throw new common_1.ForbiddenException('Cette image n’est utilisée par aucun post');
        }
        let target = url;
        let response;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
            await (0, safe_fetch_1.assertSafeRemoteUrl)(target);
            try {
                response = await fetch(target, {
                    redirect: 'manual',
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                    headers: { Accept: 'image/*' },
                });
            }
            catch (error) {
                throw new common_1.BadGatewayException(`Image injoignable : ${error instanceof Error ? error.message : error}`);
            }
            const next = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && next) {
                target = new URL(next, target).toString();
                continue;
            }
            break;
        }
        if (!response || (response.status >= 300 && response.status < 400)) {
            throw new common_1.BadGatewayException('Trop de redirections pour cette image');
        }
        if (!response.ok) {
            throw new common_1.BadGatewayException(`L’image a répondu HTTP ${response.status}`);
        }
        const type = (response.headers.get('content-type') || '').split(';')[0].trim();
        if (!type.startsWith('image/')) {
            throw new common_1.BadGatewayException(`Ce n’est pas une image (${type || 'type inconnu'})`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length)
            throw new common_1.BadGatewayException('L’image est vide');
        if (buffer.length > MAX_BYTES) {
            throw new common_1.BadGatewayException('L’image dépasse 25 Mo');
        }
        return { buffer, type };
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MediaService);
//# sourceMappingURL=media.service.js.map