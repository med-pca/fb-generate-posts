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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const prisma_service_1 = require("../prisma/prisma.service");
let GenerationService = class GenerationService {
    prisma;
    config;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async generate(dto) {
        if (dto.delayMin > dto.delayMax) {
            throw new common_1.BadRequestException('delayMin doit être inférieur ou égal à delayMax');
        }
        const apiKey = this.config.get('OPENAI_API_KEY');
        const model = this.config.get('OPENAI_MODEL');
        if (!apiKey || !model) {
            throw new common_1.ServiceUnavailableException('OPENAI_API_KEY et OPENAI_MODEL doivent être configurés');
        }
        const uniqueGroupIds = [...new Set(dto.groupIds)];
        const groupCount = await this.prisma.group.count({
            where: {
                id: { in: uniqueGroupIds },
                profiles: {
                    some: { profileId: dto.profileId, status: 'ACTIVE' },
                },
            },
        });
        if (groupCount !== uniqueGroupIds.length) {
            throw new common_1.BadRequestException('Tous les groupes doivent appartenir au profil demandé');
        }
        const openai = new openai_1.default({ apiKey });
        const response = await openai.responses.create({
            model,
            instructions: 'Rédige des publications naturelles et distinctes. Retourne uniquement le contenu demandé, sans URL ni image.',
            input: `Crée ${dto.count} publications en ${dto.language} sur le thème suivant : ${dto.topic}`,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'generated_posts',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            posts: {
                                type: 'array',
                                minItems: dto.count,
                                maxItems: dto.count,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        title: { type: 'string' },
                                        description: { type: 'string' },
                                    },
                                    required: ['title', 'description'],
                                },
                            },
                        },
                        required: ['posts'],
                    },
                },
            },
        });
        let payload;
        try {
            payload = JSON.parse(response.output_text);
        }
        catch {
            throw new common_1.ServiceUnavailableException('La réponse OpenAI ne contient pas un JSON exploitable');
        }
        return this.prisma.$transaction(payload.posts.map((generated) => this.prisma.post.create({
            data: {
                profileId: dto.profileId,
                title: generated.title,
                description: generated.description,
                url: dto.url,
                imageUrl: dto.imageUrl,
                delay: this.randomInt(dto.delayMin, dto.delayMax),
                sourceType: 'OPENAI',
                targets: {
                    create: uniqueGroupIds.map((groupId) => ({ groupId })),
                },
            },
            include: { targets: true },
        })));
    }
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
exports.GenerationService = GenerationService;
exports.GenerationService = GenerationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], GenerationService);
//# sourceMappingURL=generation.service.js.map