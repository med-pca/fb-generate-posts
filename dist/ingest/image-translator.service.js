"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ImageTranslatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageTranslatorService = exports.languageName = exports.LANGUAGES = exports.IMAGE_PROVIDER_NAMES = void 0;
exports.editPrompt = editPrompt;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const openai_1 = __importStar(require("openai"));
exports.IMAGE_PROVIDER_NAMES = ['openai', 'qwen', 'seedream'];
const TIMEOUT_MS = 180_000;
const PROVIDERS = {
    openai: { label: 'OpenAI GPT Image', key: 'OPENAI_API_KEY', model: ['OPENAI_IMAGE_MODEL', 'gpt-image-1-mini'], base: null },
    qwen: { label: 'Alibaba Qwen Image', key: 'DASHSCOPE_API_KEY', model: ['QWEN_IMAGE_MODEL', 'qwen-image-edit'], base: ['DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com'] },
    seedream: { label: 'ByteDance Seedream', key: 'ARK_API_KEY', model: ['SEEDREAM_MODEL', 'seedream-4-0-250828'], base: ['ARK_BASE_URL', 'https://ark.ap-southeast.bytepluses.com'] },
};
var languages_registry_1 = require("../languages/languages.registry");
Object.defineProperty(exports, "LANGUAGES", { enumerable: true, get: function () { return languages_registry_1.LANGUAGES; } });
Object.defineProperty(exports, "languageName", { enumerable: true, get: function () { return languages_registry_1.languageName; } });
const languages_registry_2 = require("../languages/languages.registry");
function editPrompt(language, texts = []) {
    const target = (0, languages_registry_2.languageName)(language);
    return [
        `Translate every piece of text visible in this image into ${target}.`,
        'Keep exactly the same layout, positions, font style, sizes, colours and every non-text element (people, objects, background).',
        'Replace only the words. Do not add any new text, caption, watermark or logo, and do not crop.',
        texts.length ? `Texts found in the image and their translation: ${texts.join(' | ')}` : '',
    ]
        .filter(Boolean)
        .join(' ');
}
let ImageTranslatorService = ImageTranslatorService_1 = class ImageTranslatorService {
    config;
    prisma;
    logger = new common_1.Logger(ImageTranslatorService_1.name);
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
    }
    setting(name, fallback = '') {
        return this.config.get(name) || fallback;
    }
    overrides = new Map();
    loadedAt = 0;
    async load(force = false) {
        if (!this.prisma || (!force && Date.now() - this.loadedAt < 30_000))
            return;
        const rows = await Promise.resolve(this.prisma.aiProviderSetting?.findMany()).catch(() => null);
        if (!rows)
            return;
        this.overrides = new Map(rows.map((r) => [r.provider, r]));
        this.loadedAt = Date.now();
    }
    resolved(name) {
        const def = PROVIDERS[name];
        const o = this.overrides.get(name);
        const envKey = this.setting(def.key);
        return {
            apiKey: o?.apiKey || envKey,
            keySource: o?.apiKey ? 'plateforme' : envKey ? 'serveur' : null,
            model: o?.model || this.setting(def.model[0], def.model[1]),
            baseUrl: (o?.baseUrl || (def.base ? this.setting(def.base[0], def.base[1]) : '')).replace(/\/+$/, ''),
        };
    }
    providers() {
        return exports.IMAGE_PROVIDER_NAMES.map((name) => {
            const r = this.resolved(name);
            const o = this.overrides.get(name);
            return {
                name,
                label: PROVIDERS[name].label,
                model: r.model,
                configured: Boolean(r.apiKey),
                keySource: r.keySource,
                keyHint: r.apiKey ? `…${r.apiKey.slice(-4)}` : null,
                baseUrl: r.baseUrl || null,
                defaultModel: PROVIDERS[name].model[1],
                defaultBaseUrl: PROVIDERS[name].base?.[1] ?? null,
                updatedAt: o?.updatedAt ?? null,
                updatedBy: o?.updatedBy ?? null,
            };
        });
    }
    async configure(name, input, by) {
        if (!this.prisma)
            throw new common_1.ServiceUnavailableException('Base indisponible');
        if (!exports.IMAGE_PROVIDER_NAMES.includes(name))
            throw new common_1.BadRequestException(`IA d’image inconnue : ${name}`);
        const baseUrl = input.baseUrl?.trim() || null;
        if (baseUrl && !/^https:\/\/[\w.-]+(:\d+)?(\/.*)?$/i.test(baseUrl))
            throw new common_1.BadRequestException('Adresse invalide : https://… attendu');
        const apiKey = input.apiKey?.trim();
        if (apiKey !== undefined && apiKey !== '' && (apiKey.length < 10 || /\s/.test(apiKey)))
            throw new common_1.BadRequestException('Clé invalide');
        const data = {
            ...(input.clearKey ? { apiKey: null } : apiKey ? { apiKey } : {}),
            ...(input.model !== undefined ? { model: input.model?.trim() || null } : {}),
            ...(input.baseUrl !== undefined ? { baseUrl } : {}),
            updatedBy: by,
        };
        await this.prisma.aiProviderSetting.upsert({ where: { provider: name }, create: { provider: name, ...data }, update: data });
        await this.load(true);
        return this.providers().find((p) => p.name === name);
    }
    order(preferred) {
        const configured = this.providers().filter((p) => p.configured);
        const wanted = this.setting('IMAGE_PROVIDERS', 'openai,qwen,seedream').split(',').map((s) => s.trim());
        configured.sort((a, b) => {
            if (a.name === preferred)
                return -1;
            if (b.name === preferred)
                return 1;
            return wanted.indexOf(a.name) - wanted.indexOf(b.name);
        });
        return configured;
    }
    async translate(image, language, texts = [], preferred = 'auto') {
        await this.load();
        const order = this.order(preferred);
        if (!order.length) {
            throw new common_1.ServiceUnavailableException('Aucune IA d’image configurée : saisir une clé dans Pilotage → Règles & priorités → IA d’image (ou OPENAI_API_KEY, DASHSCOPE_API_KEY, ARK_API_KEY sur le serveur)');
        }
        const prompt = editPrompt(language, texts);
        const failures = [];
        for (const p of order) {
            try {
                const out = p.name === 'openai' ? await this.openai(image, prompt, p.model) : p.name === 'qwen' ? await this.qwen(image, prompt, p.model) : await this.seedream(image, prompt, p.model);
                this.logger.log(`Image traduite (${(0, languages_registry_2.languageName)(language)}) par ${p.label} — ${p.model}`);
                return { ...out, provider: `${p.name}:${p.model}` };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`${p.label} : ${message}`);
                failures.push(`${p.label} (${message})`);
            }
        }
        throw new common_1.BadGatewayException(`Aucune IA d’image n’a traduit l’image — ${failures.join(' ; ')}`);
    }
    async openai(image, prompt, model) {
        const client = new openai_1.default({ apiKey: this.resolved('openai').apiKey, maxRetries: 0, timeout: TIMEOUT_MS });
        const ext = image.mimeType.split('/')[1] || 'png';
        const result = await client.images.edit({
            model,
            image: await (0, openai_1.toFile)(Buffer.from(image.data, 'base64'), `image.${ext}`, { type: image.mimeType }),
            prompt,
            n: 1,
        });
        const b64 = result.data?.[0]?.b64_json;
        if (b64)
            return { data: b64, mimeType: 'image/png' };
        const url = result.data?.[0]?.url;
        if (url)
            return this.download(url);
        throw new Error('réponse sans image');
    }
    async qwen(image, prompt, model) {
        const { baseUrl: base, apiKey } = this.resolved('qwen');
        const response = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
            method: 'POST',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                input: { messages: [{ role: 'user', content: [{ image: `data:${image.mimeType};base64,${image.data}` }, { text: prompt }] }] },
                parameters: { watermark: false },
            }),
        });
        const body = (await response.json().catch(() => null));
        if (!response.ok)
            throw new Error(`HTTP ${response.status} ${body?.message || body?.code || ''}`.trim());
        const url = body?.output?.choices?.[0]?.message?.content?.find?.((c) => c.image)?.image;
        if (!url)
            throw new Error('réponse sans image');
        return this.download(url);
    }
    async seedream(image, prompt, model) {
        const { baseUrl: base, apiKey } = this.resolved('seedream');
        const response = await fetch(`${base}/api/v3/images/generations`, {
            method: 'POST',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                prompt,
                image: `data:${image.mimeType};base64,${image.data}`,
                response_format: 'b64_json',
                watermark: false,
            }),
        });
        const body = (await response.json().catch(() => null));
        if (!response.ok)
            throw new Error(`HTTP ${response.status} ${body?.error?.message || ''}`.trim());
        const item = body?.data?.[0];
        if (item?.b64_json)
            return { data: item.b64_json, mimeType: 'image/jpeg' };
        if (item?.url)
            return this.download(item.url);
        throw new Error('réponse sans image');
    }
    async download(url) {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok)
            throw new Error(`image générée illisible (HTTP ${response.status})`);
        const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0].trim();
        return { data: Buffer.from(await response.arrayBuffer()).toString('base64'), mimeType };
    }
};
exports.ImageTranslatorService = ImageTranslatorService;
exports.ImageTranslatorService = ImageTranslatorService = ImageTranslatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], ImageTranslatorService);
//# sourceMappingURL=image-translator.service.js.map