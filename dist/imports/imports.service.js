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
exports.ImportsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ImportsService = class ImportsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async importJson(dto) {
        const groupIds = [...new Set(dto.groupIds)];
        const groupCount = await this.prisma.group.count({
            where: {
                id: { in: groupIds },
                profiles: {
                    some: { profileId: dto.profileId, status: 'ACTIVE' },
                },
            },
        });
        if (groupCount !== groupIds.length) {
            throw new common_1.BadRequestException('Tous les groupes doivent appartenir au profil demandé');
        }
        let imported = 0;
        let duplicates = 0;
        for (const sourcePost of dto.posts) {
            try {
                await this.prisma.post.create({
                    data: {
                        profileId: dto.profileId,
                        title: sourcePost.title,
                        description: sourcePost.description,
                        url: sourcePost.url,
                        imageUrl: sourcePost.imageUrl,
                        delay: sourcePost.delay,
                        sourceType: 'JSON',
                        externalId: sourcePost.externalId,
                        rawData: sourcePost,
                        targets: { create: groupIds.map((groupId) => ({ groupId })) },
                    },
                });
                imported += 1;
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002') {
                    duplicates += 1;
                    continue;
                }
                throw error;
            }
        }
        return { received: dto.posts.length, imported, duplicates };
    }
};
exports.ImportsService = ImportsService;
exports.ImportsService = ImportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ImportsService);
//# sourceMappingURL=imports.service.js.map