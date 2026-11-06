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
var PerfService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerfService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const prisma_service_1 = require("../prisma/prisma.service");
const perf_context_1 = require("./perf-context");
const perf_report_1 = require("./perf-report");
const FLUSH_MS = 60_000;
const KEEP_DAYS = 7;
const SLOW_MS = 2000;
let PerfService = PerfService_1 = class PerfService {
    prisma;
    logger = new common_1.Logger(PerfService_1.name);
    instance = `${(0, node_os_1.hostname)()}-${(0, node_crypto_1.randomBytes)(2).toString('hex')}`;
    buckets = new Map();
    slow = [];
    lastHash = new Map();
    timer = null;
    enabled = true;
    lastPurge = 0;
    constructor(prisma) {
        this.prisma = prisma;
    }
    onModuleInit() {
        this.timer = setInterval(() => void this.flush(), FLUSH_MS);
        this.timer.unref?.();
    }
    async onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        await this.flush();
    }
    register(fastify) {
        fastify.addHook('onRequest', (request, _reply, done) => {
            if (!this.enabled)
                return done();
            const ctx = { sql: 0, sqlMs: 0, started: performance.now() };
            request.perf = ctx;
            perf_context_1.perfContext.run(ctx, done);
        });
        fastify.addHook('onSend', (request, reply, payload, done) => {
            const ctx = request.perf;
            if (ctx && (typeof payload === 'string' || Buffer.isBuffer(payload))) {
                ctx.bytes = Buffer.byteLength(payload);
                if (request.method === 'GET' && reply.statusCode === 200 && ctx.bytes < 2_000_000) {
                    ctx.hash = (0, node_crypto_1.createHash)('sha1').update(payload).digest('base64');
                }
            }
            done(null, payload);
        });
        fastify.addHook('onResponse', (request, reply, done) => {
            try {
                this.record(request, reply);
            }
            catch {
            }
            done();
        });
    }
    record(request, reply) {
        const ctx = request.perf;
        if (!ctx)
            return;
        const route = request.routeOptions?.url || 'route inconnue';
        if (!route.startsWith('/api/') || route.startsWith('/api/docs'))
            return;
        const ms = performance.now() - ctx.started;
        const caller = (0, perf_report_1.callerOf)({
            route,
            hasApiKey: Boolean(request.headers['x-api-key']),
            user: request.user ?? null,
            userAgent: String(request.headers['user-agent'] || ''),
        });
        const key = `${request.method} ${route}|${caller}`;
        let b = this.buckets.get(key);
        if (!b) {
            b = { method: request.method, route, caller, count: 0, errors: 0, totalMs: 0, maxMs: 0, sqlCount: 0, sqlMs: 0, bytes: 0, gets: 0, repeats: 0, buckets: Array(perf_report_1.BUCKETS.length + 1).fill(0) };
            this.buckets.set(key, b);
        }
        b.count += 1;
        if (reply.statusCode >= 500)
            b.errors += 1;
        b.totalMs += ms;
        b.maxMs = Math.max(b.maxMs, ms);
        b.sqlCount += ctx.sql;
        b.sqlMs += ctx.sqlMs;
        b.bytes += ctx.bytes ?? 0;
        b.buckets[(0, perf_report_1.bucketOf)(ms)] += 1;
        if (ctx.hash) {
            b.gets += 1;
            const who = `${request.url}|${request.user?.username ?? String(request.headers['x-api-key'] || '').slice(-6)}`;
            if (this.lastHash.get(who) === ctx.hash)
                b.repeats += 1;
            if (this.lastHash.size > 20_000)
                this.lastHash.clear();
            this.lastHash.set(who, ctx.hash);
        }
        if (ms >= SLOW_MS && this.slow.length < 500) {
            this.slow.push({
                at: new Date(),
                method: request.method,
                route,
                url: request.url.replace(/([?&](key|token|apiKey|api_key)=)[^&]+/gi, '$1…').slice(0, 1000),
                caller,
                status: reply.statusCode,
                ms,
                sqlCount: ctx.sql,
                sqlMs: ctx.sqlMs,
                bytes: ctx.bytes ?? 0,
            });
        }
    }
    async flush() {
        const rows = [...this.buckets.values()];
        const slow = this.slow;
        this.buckets = new Map();
        this.slow = [];
        const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
        try {
            const s = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { perfEnabled: true } });
            this.enabled = s?.perfEnabled !== false;
            if (rows.length) {
                await this.prisma.apiMetric.createMany({
                    data: rows.map((r) => ({
                        minute,
                        instance: this.instance,
                        method: r.method,
                        route: r.route,
                        caller: r.caller,
                        count: r.count,
                        errors: r.errors,
                        totalMs: r.totalMs,
                        maxMs: r.maxMs,
                        sqlCount: r.sqlCount,
                        sqlMs: r.sqlMs,
                        bytes: BigInt(Math.round(r.bytes)),
                        gets: r.gets,
                        repeats: r.repeats,
                        ...Object.fromEntries(r.buckets.map((n, i) => [`b${i}`, n])),
                    })),
                });
            }
            if (slow.length)
                await this.prisma.apiSlowCall.createMany({ data: slow.map((x) => ({ ...x, instance: this.instance })) });
            if (Date.now() - this.lastPurge > 3_600_000) {
                this.lastPurge = Date.now();
                const before = new Date(Date.now() - KEEP_DAYS * 86_400_000);
                await this.prisma.apiMetric.deleteMany({ where: { minute: { lt: before } } });
                await this.prisma.apiSlowCall.deleteMany({ where: { at: { lt: before } } });
            }
        }
        catch (error) {
            this.logger.warn(`Mesures non écrites : ${error instanceof Error ? error.message : error}`);
        }
    }
    async report(hours) {
        const h = Math.max(1, Math.min(KEEP_DAYS * 24, Math.round(hours) || 24));
        const since = new Date(Date.now() - h * 3_600_000);
        const sums = { count: true, errors: true, totalMs: true, sqlCount: true, sqlMs: true, bytes: true, gets: true, repeats: true, b0: true, b1: true, b2: true, b3: true, b4: true, b5: true, b6: true, b7: true, b8: true, b9: true };
        const [byRoute, byCaller, byRouteCaller, slow, first, settings, instances] = await Promise.all([
            this.prisma.apiMetric.groupBy({ by: ['method', 'route'], where: { minute: { gte: since } }, _sum: sums, _max: { maxMs: true } }),
            this.prisma.apiMetric.groupBy({ by: ['caller'], where: { minute: { gte: since } }, _sum: sums, _max: { maxMs: true } }),
            this.prisma.apiMetric.groupBy({ by: ['method', 'route', 'caller'], where: { minute: { gte: since } }, _sum: sums, _max: { maxMs: true } }),
            this.prisma.apiSlowCall.findMany({ where: { at: { gte: since } }, orderBy: { at: 'desc' }, take: 50 }),
            this.prisma.apiMetric.findFirst({ where: { minute: { gte: since } }, orderBy: { minute: 'asc' }, select: { minute: true } }),
            this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { perfEnabled: true } }),
            this.prisma.apiMetric.groupBy({ by: ['instance'], where: { minute: { gte: since } } }),
        ]);
        const minutes = first ? Math.max(1, (Date.now() - first.minute.getTime()) / 60_000) : h * 60;
        const toSum = (g) => {
            const n = (k) => Number(g._sum[k] ?? 0);
            return {
                method: g.method ?? '',
                route: g.route ?? '',
                ...(g.caller !== undefined ? { caller: g.caller } : {}),
                count: n('count'),
                errors: n('errors'),
                totalMs: n('totalMs'),
                maxMs: Number(g._max.maxMs ?? 0),
                sqlCount: n('sqlCount'),
                sqlMs: n('sqlMs'),
                bytes: n('bytes'),
                gets: n('gets'),
                repeats: n('repeats'),
                buckets: Array.from({ length: perf_report_1.BUCKETS.length + 1 }, (_, i) => n(`b${i}`)),
            };
        };
        const routes = byRoute.map((g) => (0, perf_report_1.readRoute)(toSum(g), minutes)).sort((a, b) => b.costSeconds - a.costSeconds);
        const total = routes.reduce((t, r) => ({ count: t.count + r.count, cost: t.cost + r.costSeconds, errors: t.errors + r.errors }), { count: 0, cost: 0, errors: 0 });
        const all = toSum({ _sum: Object.fromEntries(Object.keys(sums).map((k) => [k, byRoute.reduce((n, g) => n + Number(g._sum[k] ?? 0), 0)])), _max: { maxMs: Math.max(0, ...byRoute.map((g) => g._max.maxMs ?? 0)) } });
        const overall = (0, perf_report_1.readRoute)(all, minutes);
        return {
            hours: h,
            minutesMeasured: Math.round(minutes),
            enabled: settings?.perfEnabled !== false,
            instances: instances.length,
            summary: { calls: total.count, perHour: overall.perHour, avgMs: overall.avgMs, p95: overall.p95, sqlAvg: overall.sqlAvg, errors: total.errors, costSeconds: total.cost },
            routes: routes.slice(0, 60),
            cache: routes.filter((r) => r.advice.some((a) => a.kind === 'cache')).sort((a, b) => b.repeatRatio * b.count - a.repeatRatio * a.count).slice(0, 20),
            problems: routes.filter((r) => r.advice.some((a) => a.kind !== 'cache')).slice(0, 20),
            callers: byCaller.map((g) => (0, perf_report_1.readRoute)(toSum(g), minutes)).sort((a, b) => b.costSeconds - a.costSeconds),
            who: byRouteCaller.map((g) => (0, perf_report_1.readRoute)(toSum(g), minutes)).sort((a, b) => b.count - a.count).slice(0, 40),
            slow: slow.map((s) => ({ at: s.at, method: s.method, route: s.route, url: s.url, caller: s.caller, status: s.status, ms: Math.round(s.ms), sqlCount: s.sqlCount, sqlMs: Math.round(s.sqlMs), kb: Math.round(s.bytes / 102.4) / 10 })),
        };
    }
    async setEnabled(enabled) {
        await this.prisma.automationSetting.upsert({ where: { id: 'global' }, create: { id: 'global', perfEnabled: enabled }, update: { perfEnabled: enabled } });
        this.enabled = enabled;
        return { enabled };
    }
};
exports.PerfService = PerfService;
exports.PerfService = PerfService = PerfService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PerfService);
//# sourceMappingURL=perf.service.js.map