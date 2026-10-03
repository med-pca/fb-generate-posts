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
var PluginCheckService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginCheckService = void 0;
exports.classifyPluginResponse = classifyPluginResponse;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const safe_fetch_1 = require("../common/safe-fetch");
const TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MINUTES = 360;
const STARTUP_DELAY_MS = 60_000;
const OUTDATED_MESSAGE = 'Ancienne extension : elle envoie ses articles, mais ne se laisse pas ' +
    'vérifier et ne reçoit pas les reprises. Installer la version 1.3.0.';
function classifyPluginResponse(status, body, delivers = false) {
    const json = (body && typeof body === 'object' ? body : {});
    if (status >= 200 && status < 300 && json.plugin === 'data-fb-posting') {
        return {
            state: client_1.PluginState.CONNECTED,
            version: json.version ?? null,
            message: json.endpointConfigured
                ? 'Extension active, clé acceptée'
                : 'Extension active, mais l’URL de l’API n’est pas renseignée dans ses réglages : ' +
                    'elle ne nous enverra pas ses articles',
        };
    }
    if (typeof json.code === 'string' && json.code.startsWith('dfb_')) {
        return {
            state: client_1.PluginState.BAD_KEY,
            version: json.data?.version ?? null,
            message: json.message || 'L’extension refuse la clé',
        };
    }
    if (delivers && status === 404) {
        return {
            state: client_1.PluginState.OUTDATED,
            version: null,
            message: OUTDATED_MESSAGE,
        };
    }
    return {
        state: client_1.PluginState.MISSING,
        version: null,
        message: status === 404
            ? 'Extension Data FB Posting absente ou désactivée'
            : `Réponse inattendue (HTTP ${status}) : extension absente ou bloquée`,
    };
}
let PluginCheckService = PluginCheckService_1 = class PluginCheckService {
    prisma;
    config;
    logger = new common_1.Logger(PluginCheckService_1.name);
    timer;
    startup;
    running = false;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    onModuleInit() {
        const raw = Number(this.config.get('SITE_CHECK_INTERVAL_MINUTES') ??
            DEFAULT_INTERVAL_MINUTES);
        const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INTERVAL_MINUTES;
        if (!minutes)
            return;
        this.startup = setTimeout(() => void this.checkAll(), STARTUP_DELAY_MS);
        this.timer = setInterval(() => void this.checkAll(), minutes * 60_000);
        this.timer.unref?.();
        this.startup.unref?.();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        if (this.startup)
            clearTimeout(this.startup);
    }
    async checkAll(ids) {
        if (this.running)
            return [];
        this.running = true;
        try {
            const sites = await this.prisma.contentSource.findMany({
                where: ids ? { id: { in: ids } } : { status: 'ACTIVE' },
                select: { id: true },
            });
            const results = [];
            for (const { id } of sites)
                results.push(await this.check(id));
            return results;
        }
        catch (error) {
            this.logger.error(`Vérification des sites en échec : ${error instanceof Error ? error.message : error}`);
            return [];
        }
        finally {
            this.running = false;
        }
    }
    async check(siteId) {
        const site = await this.prisma.contentSource.findUniqueOrThrow({
            where: { id: siteId },
            select: {
                id: true,
                name: true,
                originUrl: true,
                depositKey: true,
                lastDeliveryAt: true,
                pluginState: true,
                articles: {
                    select: { importedAt: true },
                    orderBy: { importedAt: 'desc' },
                    take: 1,
                },
            },
        });
        const lastDeliveryAt = site.lastDeliveryAt ?? site.articles[0]?.importedAt ?? null;
        const result = await this.probe(site.originUrl, site.depositKey || this.config.get('WORDPRESS_API_KEY') || '', Boolean(lastDeliveryAt));
        await this.prisma.contentSource.update({
            where: { id: site.id },
            data: {
                lastDeliveryAt,
                pluginState: result.state,
                pluginVersion: result.version,
                pluginMessage: result.message,
                pluginCheckedAt: new Date(),
            },
        });
        if (site.pluginState !== result.state) {
            await this.prisma.activityLog
                .create({
                data: {
                    eventType: 'SITE_PLUGIN_CHANGED',
                    level: result.state === client_1.PluginState.CONNECTED ? 'INFO' : 'WARN',
                    message: `${site.name} : extension ${site.pluginState} → ${result.state} — ${result.message}`,
                    metadata: {
                        siteId: site.id,
                        siteUrl: site.originUrl,
                        from: site.pluginState,
                        to: result.state,
                        version: result.version,
                    },
                },
            })
                .catch(() => undefined);
        }
        return { siteId: site.id, ...result };
    }
    async probe(originUrl, key, delivers) {
        const endpoint = `${originUrl}/wp-json/dfb/v1/status`;
        let response;
        try {
            await (0, safe_fetch_1.assertSafeRemoteUrl)(endpoint);
            response = await fetch(endpoint, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
                redirect: 'manual',
                headers: key ? { 'x-api-key': key } : {},
            });
        }
        catch (error) {
            return {
                state: client_1.PluginState.UNREACHABLE,
                version: null,
                message: `Site injoignable : ${error instanceof Error ? error.message : error}`,
            };
        }
        let body = null;
        try {
            body = await response.json();
        }
        catch {
            body = null;
        }
        return classifyPluginResponse(response.status, body, delivers);
    }
};
exports.PluginCheckService = PluginCheckService;
exports.PluginCheckService = PluginCheckService = PluginCheckService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], PluginCheckService);
//# sourceMappingURL=plugin-check.service.js.map