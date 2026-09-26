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
exports.WordpressWriterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const safe_fetch_1 = require("../common/safe-fetch");
const MAX_IMAGE_BYTES = 10_000_000;
const IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
const TIMEOUT_MS = 60_000;
let WordpressWriterService = class WordpressWriterService {
    config;
    constructor(config) {
        this.config = config;
    }
    async deposit(input) {
        const key = this.config.get('WORDPRESS_API_KEY');
        if (!key) {
            throw new common_1.ServiceUnavailableException('WORDPRESS_API_KEY doit être configuré pour déposer un article');
        }
        const image = input.imageUrl ? await this.fetchImage(input.imageUrl) : null;
        const endpoint = `${input.siteUrl}/wp-json/dfb/v1/articles`;
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { 'content-type': 'application/json', 'x-api-key': key },
                body: JSON.stringify({
                    title: input.article.title,
                    slug: input.article.slug,
                    excerpt: input.article.excerpt,
                    contentHtml: input.article.contentHtml,
                    ingestRef: input.ingestRef,
                    image,
                }),
            });
        }
        catch {
            throw new common_1.BadGatewayException(`Site WordPress injoignable (${endpoint})`);
        }
        const body = await response.text();
        if (!response.ok) {
            throw new common_1.BadGatewayException(`WordPress a refusé le dépôt (HTTP ${response.status}) : ${body.slice(0, 200)}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(body);
        }
        catch {
            throw new common_1.BadGatewayException('WordPress n’a pas répondu en JSON : vérifier que le plugin 1.2.0 est actif');
        }
        if (!parsed.postId || !parsed.permalink) {
            throw new common_1.BadGatewayException('Réponse WordPress incomplète : postId et permalink attendus');
        }
        return {
            postId: parsed.postId,
            permalink: parsed.permalink,
            imageWarning: parsed.imageWarning ?? null,
        };
    }
    async fetchImage(imageUrl) {
        const url = await (0, safe_fetch_1.assertSafeRemoteUrl)(imageUrl);
        let response;
        try {
            response = await fetch(url, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { accept: 'image/*' },
            });
        }
        catch {
            throw new common_1.BadGatewayException('Image du post d’origine injoignable');
        }
        if (!response.ok) {
            throw new common_1.BadGatewayException(`L’image a répondu avec le statut ${response.status}`);
        }
        const mimeType = (response.headers.get('content-type') || '')
            .split(';')[0]
            .trim()
            .toLowerCase();
        if (!IMAGE_TYPES.has(mimeType)) {
            throw new common_1.BadGatewayException(`Type d’image non accepté : ${mimeType || 'inconnu'}`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length)
            throw new common_1.BadGatewayException('Image vide');
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new common_1.BadGatewayException('Image trop volumineuse');
        }
        return {
            data: bytes.toString('base64'),
            mimeType,
            filename: this.filename(url, mimeType),
        };
    }
    filename(url, mimeType) {
        const extension = mimeType.replace('image/', '').replace('jpeg', 'jpg');
        const base = (url.pathname.split('/').pop() || 'image')
            .replace(/\.[^.]*$/, '')
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 60);
        return `${base || 'image'}.${extension}`;
    }
};
exports.WordpressWriterService = WordpressWriterService;
exports.WordpressWriterService = WordpressWriterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WordpressWriterService);
//# sourceMappingURL=wordpress-writer.service.js.map