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
var IngestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestService = void 0;
exports.resumeStatus = resumeStatus;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_1 = require("../common/paginated");
const rewriter_service_1 = require("./rewriter.service");
const source_reader_service_1 = require("./source-reader.service");
const wordpress_writer_service_1 = require("./wordpress-writer.service");
const MAX_ATTEMPTS = 5;
function resumeStatus(ingest) {
    if (ingest.generated)
        return client_1.IngestStatus.REWRITTEN;
    if (ingest.sourceText)
        return client_1.IngestStatus.REWRITING;
    if (ingest.fbCaption)
        return client_1.IngestStatus.SCRAPED;
    return client_1.IngestStatus.PENDING_SCRAPE;
}
let IngestService = IngestService_1 = class IngestService {
    prisma;
    config;
    reader;
    rewriter;
    wordpress;
    logger = new common_1.Logger(IngestService_1.name);
    running = new Set();
    constructor(prisma, config, reader, rewriter, wordpress) {
        this.prisma = prisma;
        this.config = config;
        this.reader = reader;
        this.rewriter = rewriter;
        this.wordpress = wordpress;
    }
    async create(dto) {
        const siteUrl = this.siteUrl(dto.siteUrl);
        const profileIds = [...new Set(dto.profileIds ?? [])];
        const groupIds = [...new Set(dto.groupIds ?? [])];
        await this.assertScope(profileIds, groupIds);
        const ingest = await this.prisma.sourceIngest.create({
            data: {
                facebookUrl: dto.facebookUrl,
                sourceUrl: dto.sourceUrl,
                siteUrl,
                language: dto.language,
                profileIds,
                groupIds,
            },
        });
        await this.log(ingest.id, 'INGEST_CREATED', 'Reprise enregistrée', {
            facebookUrl: ingest.facebookUrl,
            sourceUrl: ingest.sourceUrl,
        });
        return ingest;
    }
    async findAll({ page, limit }) {
        const [data, total] = await this.prisma.$transaction([
            this.prisma.sourceIngest.findMany({
                include: {
                    article: { select: { id: true, title: true, articleUrl: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.sourceIngest.count(),
        ]);
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    async findOne(id) {
        const ingest = await this.prisma.sourceIngest.findUnique({
            where: { id },
            include: { article: true },
        });
        if (!ingest)
            throw new common_1.NotFoundException('Reprise introuvable');
        return ingest;
    }
    async remove(id) {
        await this.load(id);
        return this.prisma.sourceIngest.delete({ where: { id } });
    }
    async capture(dto) {
        const ingest = await this.create(dto);
        return this.submitScrape(ingest.id, {
            caption: dto.caption,
            imageUrl: dto.imageUrl,
        });
    }
    async claimScrape(profileExternalId) {
        const ttlMinutes = this.config.get('CLAIM_TTL_MINUTES', 30);
        const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        const claimed = await this.prisma.$transaction(async (tx) => {
            const [row] = await tx.$queryRaw(client_1.Prisma.sql `
        SELECT id FROM source_ingests
        WHERE status = 'PENDING_SCRAPE'::"IngestStatus"
           OR (status = 'SCRAPING'::"IngestStatus" AND claim_expires_at < NOW())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
            if (!row)
                return null;
            return tx.sourceIngest.update({
                where: { id: row.id },
                data: {
                    status: client_1.IngestStatus.SCRAPING,
                    claimedAt: new Date(),
                    claimExpiresAt,
                },
            });
        });
        if (!claimed) {
            return { scrape: null, message: 'Aucune collecte en attente' };
        }
        await this.log(claimed.id, 'INGEST_SCRAPE_CLAIMED', 'Collecte réservée', {
            profileExternalId: profileExternalId ?? null,
        });
        return {
            scrape: {
                scrapeId: claimed.id,
                facebookUrl: claimed.facebookUrl,
                claimExpiresAt: claimed.claimExpiresAt,
            },
        };
    }
    async failScrape(id, error) {
        const ingest = await this.load(id);
        const attempts = ingest.attempts + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        await this.log(id, 'INGEST_FAILED', error, {
            stage: client_1.IngestStatus.PENDING_SCRAPE,
            attempts,
            exhausted,
        });
        return this.prisma.sourceIngest.update({
            where: { id },
            data: {
                attempts,
                lastError: error,
                status: exhausted ? client_1.IngestStatus.FAILED : client_1.IngestStatus.PENDING_SCRAPE,
                claimedAt: null,
                claimExpiresAt: null,
            },
        });
    }
    async submitScrape(id, dto) {
        const ingest = await this.load(id);
        if (ingest.status !== client_1.IngestStatus.PENDING_SCRAPE &&
            ingest.status !== client_1.IngestStatus.SCRAPING &&
            ingest.status !== client_1.IngestStatus.FAILED) {
            throw new common_1.BadRequestException(`Cette reprise a dépassé l’étape de collecte (${ingest.status})`);
        }
        await this.log(id, 'INGEST_SCRAPED', 'Publication d’origine relevée', {
            hasImage: Boolean(dto.imageUrl),
            captionLength: dto.caption.length,
        });
        return this.prisma.sourceIngest.update({
            where: { id },
            data: {
                fbCaption: dto.caption,
                fbImageUrl: dto.imageUrl ?? null,
                status: client_1.IngestStatus.SCRAPED,
                claimedAt: null,
                claimExpiresAt: null,
                lastError: null,
            },
        });
    }
    async retry(id) {
        const ingest = await this.load(id);
        await this.prisma.sourceIngest.update({
            where: { id },
            data: {
                status: resumeStatus(ingest),
                attempts: 0,
                lastError: null,
            },
        });
        return this.advance(id);
    }
    async advance(id) {
        if (this.running.has(id))
            return this.load(id);
        this.running.add(id);
        try {
            let ingest = await this.load(id);
            for (;;) {
                const next = await this.step(ingest);
                if (!next)
                    return this.load(id);
                ingest = next;
            }
        }
        finally {
            this.running.delete(id);
        }
    }
    async step(ingest) {
        switch (ingest.status) {
            case client_1.IngestStatus.SCRAPED:
                return this.guard(ingest, 'INGEST_SOURCE_READ', 'Page source lue', () => this.readSource(ingest));
            case client_1.IngestStatus.REWRITING:
                return this.guard(ingest, 'INGEST_REWRITTEN', 'Article réécrit', () => this.rewrite(ingest));
            case client_1.IngestStatus.REWRITTEN:
                return this.guard(ingest, 'INGEST_PUBLISHED', 'Article déposé sur WordPress', () => this.publishToWordpress(ingest));
            default:
                return null;
        }
    }
    async guard(ingest, event, message, run) {
        try {
            const updated = await run();
            await this.log(ingest.id, event, message);
            return updated;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            const attempts = ingest.attempts + 1;
            const exhausted = attempts >= MAX_ATTEMPTS;
            this.logger.error(`Reprise ${ingest.id} en échec : ${message}`);
            await this.prisma.sourceIngest.update({
                where: { id: ingest.id },
                data: {
                    attempts,
                    lastError: message,
                    ...(exhausted ? { status: client_1.IngestStatus.FAILED } : {}),
                },
            });
            await this.log(ingest.id, 'INGEST_FAILED', message, {
                stage: ingest.status,
                attempts,
                exhausted,
            });
            return null;
        }
    }
    async readSource(ingest) {
        const source = await this.reader.read(ingest.sourceUrl);
        const resolved = this.resolvedLanguage(ingest.language, source.language);
        return this.prisma.sourceIngest.update({
            where: { id: ingest.id },
            data: {
                sourceTitle: source.title,
                sourceText: source.text,
                language: resolved,
                status: client_1.IngestStatus.REWRITING,
                lastError: null,
            },
        });
    }
    resolvedLanguage(requested, detected) {
        const wanted = requested.trim().toLowerCase();
        if (wanted && wanted !== 'auto')
            return requested;
        return detected ?? 'auto';
    }
    async rewrite(ingest) {
        const generated = await this.rewriter.rewrite({
            source: {
                url: ingest.sourceUrl,
                title: ingest.sourceTitle ?? '',
                text: ingest.sourceText ?? '',
                excerpt: null,
                leadImageUrl: null,
                siteName: null,
                language: null,
            },
            fbCaption: ingest.fbCaption,
            language: ingest.language,
        });
        return this.prisma.sourceIngest.update({
            where: { id: ingest.id },
            data: {
                generated,
                status: client_1.IngestStatus.REWRITTEN,
                lastError: null,
            },
        });
    }
    async publishToWordpress(ingest) {
        const generated = ingest.generated;
        if (!generated)
            throw new Error('Aucune réécriture à déposer');
        const deposit = await this.wordpress.deposit({
            siteUrl: ingest.siteUrl,
            ingestRef: ingest.id,
            article: generated,
            imageUrl: ingest.fbImageUrl,
        });
        if (deposit.imageWarning) {
            await this.log(ingest.id, 'INGEST_IMAGE_SKIPPED', deposit.imageWarning);
        }
        return this.prisma.sourceIngest.update({
            where: { id: ingest.id },
            data: {
                wpPostId: deposit.postId,
                wpPermalink: deposit.permalink,
                status: client_1.IngestStatus.AWAITING_ECHO,
                lastError: null,
            },
        });
    }
    siteUrl(provided) {
        const raw = provided ?? this.config.get('WORDPRESS_SITE_URL');
        if (!raw) {
            throw new common_1.BadRequestException('Indiquer siteUrl, ou configurer WORDPRESS_SITE_URL');
        }
        const url = new URL(raw);
        if (url.username || url.password || url.search || url.hash) {
            throw new common_1.BadRequestException('siteUrl ne doit porter ni identifiants, ni paramètres');
        }
        return url.origin + url.pathname.replace(/\/+$/, '');
    }
    async assertScope(profileIds, groupIds) {
        if (profileIds.length) {
            const known = await this.prisma.profile.count({
                where: { id: { in: profileIds }, status: 'ACTIVE' },
            });
            if (known !== profileIds.length) {
                throw new common_1.BadRequestException('Tous les profils doivent exister et être actifs');
            }
        }
        if (!groupIds.length)
            return;
        const linked = await this.prisma.group.count({
            where: {
                id: { in: groupIds },
                status: 'ACTIVE',
                profiles: {
                    some: {
                        status: 'ACTIVE',
                        ...(profileIds.length ? { profileId: { in: profileIds } } : {}),
                    },
                },
            },
        });
        if (linked !== groupIds.length) {
            throw new common_1.BadRequestException(profileIds.length
                ? 'Tous les groupes doivent être rattachés aux profils retenus'
                : 'Tous les groupes doivent être actifs et rattachés à un profil');
        }
    }
    async load(id) {
        const ingest = await this.prisma.sourceIngest.findUnique({ where: { id } });
        if (!ingest)
            throw new common_1.NotFoundException('Reprise introuvable');
        return ingest;
    }
    log(ingestId, eventType, message, metadata = {}) {
        return this.prisma.activityLog
            .create({
            data: {
                eventType,
                level: eventType.endsWith('_FAILED') ? 'ERROR' : 'INFO',
                message,
                metadata: { ingestId, ...metadata },
            },
        })
            .catch(() => undefined);
    }
};
exports.IngestService = IngestService;
exports.IngestService = IngestService = IngestService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        source_reader_service_1.SourceReaderService,
        rewriter_service_1.RewriterService,
        wordpress_writer_service_1.WordpressWriterService])
], IngestService);
//# sourceMappingURL=ingest.service.js.map