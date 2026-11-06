"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortCacheService = void 0;
const common_1 = require("@nestjs/common");
const MAX_ENTRIES = 2000;
let ShortCacheService = class ShortCacheService {
    entries = new Map();
    get(acting, key, ttlMs, compute) {
        const full = `${acting?.id ?? 'global'}|${key}`;
        const now = Date.now();
        const hit = this.entries.get(full);
        if (hit && now - hit.at < ttlMs)
            return hit.value;
        if (this.entries.size >= MAX_ENTRIES)
            this.sweep(now);
        const value = compute();
        this.entries.set(full, { at: now, value });
        value.catch(() => {
            if (this.entries.get(full)?.value === value)
                this.entries.delete(full);
        });
        return value;
    }
    clear() {
        this.entries.clear();
    }
    register(fastify) {
        fastify.addHook('onResponse', (request, reply, done) => {
            if (request.method !== 'GET' &&
                request.method !== 'HEAD' &&
                request.method !== 'OPTIONS' &&
                !request.headers['x-api-key'] &&
                reply.statusCode < 400) {
                this.clear();
            }
            done();
        });
    }
    sweep(now) {
        for (const [key, entry] of this.entries)
            if (now - entry.at > 60_000)
                this.entries.delete(key);
        if (this.entries.size >= MAX_ENTRIES)
            this.entries.clear();
    }
};
exports.ShortCacheService = ShortCacheService;
exports.ShortCacheService = ShortCacheService = __decorate([
    (0, common_1.Injectable)()
], ShortCacheService);
//# sourceMappingURL=short-cache.service.js.map