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
const sites_service_1 = require("../sites/sites.service");
const scope_1 = require("../auth/scope");
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
    async create(dto, owner = null) {
        const profileIds = [...new Set(dto.profileIds ?? [])];
        const groupIds = [...new Set(dto.groupIds ?? [])];
        let siteUrl;
        try {
            ({ siteUrl } = await this.resolveSite(dto.siteUrl));
            await this.assertScope(profileIds, groupIds);
        }
        catch (error) {
            await this.prisma.activityLog
                .create({
                data: {
                    eventType: 'INGEST_REJECTED',
                    level: 'WARN',
                    message: `Capture refusée : ${error instanceof Error ? error.message : String(error)}`,
                    metadata: {
                        facebookUrl: dto.facebookUrl,
                        sourceUrl: dto.sourceUrl,
                        siteUrl: dto.siteUrl ?? null,
                        by: owner?.username ?? 'clé globale',
                    },
                },
            })
                .catch(() => undefined);
            throw error;
        }
        const ingest = await this.prisma.sourceIngest.create({
            data: {
                facebookUrl: dto.facebookUrl,
                sourceUrl: dto.sourceUrl,
                siteUrl,
                language: dto.language,
                profileIds,
                groupIds,
                ownerId: owner?.id ?? null,
            },
        });
        await this.log(ingest.id, 'INGEST_CREATED', 'Reprise enregistrée', {
            facebookUrl: ingest.facebookUrl,
            sourceUrl: ingest.sourceUrl,
        });
        return ingest;
    }
    async findAll({ page, limit }, acting) {
        const where = (0, scope_1.ingestWhere)((0, scope_1.scopeOf)(acting));
        const [data, total] = await this.prisma.$transaction([
            this.prisma.sourceIngest.findMany({
                where,
                include: {
                    article: { select: { id: true, title: true, articleUrl: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.sourceIngest.count({ where }),
        ]);
        return (0, paginated_1.paginated)(data, total, page, limit);
    }
    async findOne(id, acting) {
        const ingest = await this.prisma.sourceIngest.findFirst({
            where: { id, ...(0, scope_1.ingestWhere)((0, scope_1.scopeOf)(acting)) },
            include: { article: true },
        });
        if (!ingest)
            throw new common_1.NotFoundException('Reprise introuvable');
        return ingest;
    }
    async remove(id, acting) {
        await this.load(id, acting);
        return this.prisma.sourceIngest.delete({ where: { id } });
    }
    async capture(dto, owner = null) {
        const ingest = await this.create(dto, owner);
        return this.submitScrape(ingest.id, {
            caption: dto.caption,
            imageUrl: dto.imageUrl,
        });
    }
    async claimScrape(profileExternalId, acting = null) {
        const ttlMinutes = this.config.get('CLAIM_TTL_MINUTES', 30);
        const claimExpiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        const claimed = await this.prisma.$transaction(async (tx) => {
            const mine = (0, scope_1.scopeOf)(acting);
            const [row] = await tx.$queryRaw(client_1.Prisma.sql `
        SELECT id FROM source_ingests
        WHERE (status = 'PENDING_SCRAPE'::"IngestStatus"
               OR (status = 'SCRAPING'::"IngestStatus" AND claim_expires_at < NOW()))
          AND (${mine === null} OR owner_id = ${mine?.ownerId ?? null})
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
    async failScrape(id, error, acting = null) {
        const ingest = await this.load(id, acting);
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
    async submitScrape(id, dto, acting) {
        const ingest = await this.load(id, acting);
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
    async retry(id, acting) {
        const ingest = await this.load(id, acting);
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
        const pages = source.pageUrls?.length ?? 1;
        await this.log(ingest.id, 'INGEST_SOURCE_READ', pages > 1
            ? `Article source lu sur ${pages} pages (${source.text.length} caractères)`
            : `Article source lu (${source.text.length} caractères)`, { pages: source.pageUrls ?? [source.url] });
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
        const { depositKey } = await this.resolveSite(ingest.siteUrl);
        const deposit = await this.wordpress.deposit({
            siteUrl: ingest.siteUrl,
            apiKey: depositKey,
            ingestRef: ingest.id,
            article: generated,
            imageUrl: ingest.fbImageUrl,
            language: ingest.language,
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
    async resolveSite(provided) {
        const raw = provided ?? this.config.get('WORDPRESS_SITE_URL');
        if (!raw) {
            throw new common_1.BadRequestException('Indiquer siteUrl, ou configurer WORDPRESS_SITE_URL');
        }
        const siteUrl = (0, sites_service_1.normalizeSiteUrl)(raw);
        const site = await this.prisma.contentSource.findUnique({
            where: { originUrl: siteUrl },
        });
        if (!site) {
            const fallback = this.config.get('WORDPRESS_SITE_URL');
            if (!fallback || (0, sites_service_1.normalizeSiteUrl)(fallback) !== siteUrl) {
                throw new common_1.BadRequestException(`Site inconnu : ${siteUrl}. Le déclarer dans la plateforme, section Sites.`);
            }
            const created = await this.prisma.contentSource.create({
                data: { originUrl: siteUrl, name: new URL(siteUrl).hostname },
            });
            return { siteUrl, depositKey: created.depositKey };
        }
        if (site.status !== 'ACTIVE') {
            throw new common_1.BadRequestException(`${site.name} est désactivé comme destination`);
        }
        const blocker = (0, sites_service_1.pluginBlocker)(site.pluginState);
        if (blocker) {
            throw new common_1.BadRequestException(`${site.name} : ${blocker}. Corriger puis cliquer « Vérifier » dans la page Sites.`);
        }
        return { siteUrl, depositKey: site.depositKey };
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
    async load(id, acting) {
        const ingest = await this.prisma.sourceIngest.findFirst({
            where: {
                id,
                ...(acting === undefined ? {} : (0, scope_1.ingestWhere)((0, scope_1.scopeOf)(acting))),
            },
        });
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