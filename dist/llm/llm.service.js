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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var LlmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmService = exports.chatCompletionsTransport = exports.LLM_TRANSPORT = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
exports.LLM_TRANSPORT = Symbol('LLM_TRANSPORT');
const DEFAULTS = {
    kimi: {
        baseURL: 'https://api.moonshot.ai/v1',
        model: 'kimi-k2.6',
        jsonSchema: false,
        tokenParam: 'max_tokens',
        maxTokens: 0,
        timeoutMs: 0,
    },
    openai: {
        baseURL: undefined,
        model: 'gpt-4.1-mini',
        jsonSchema: true,
        tokenParam: 'max_completion_tokens',
        maxTokens: 0,
        timeoutMs: 0,
    },
    deepseek: {
        baseURL: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-pro',
        jsonSchema: false,
        tokenParam: 'max_tokens',
        maxTokens: 8000,
        timeoutMs: 180_000,
    },
    gemini: {
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-2.5-flash',
        jsonSchema: true,
        tokenParam: 'max_tokens',
        maxTokens: 0,
        timeoutMs: 0,
    },
};
const DEFAULT_ORDER = 'openai,deepseek,gemini,kimi';
const DEFAULT_TIMEOUT_MS = 90_000;
const chatCompletionsTransport = async (provider, request) => {
    const client = new openai_1.default({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
        maxRetries: 0,
        timeout: provider.timeoutMs,
    });
    const response = await client.chat.completions.create({
        model: provider.model,
        [provider.tokenParam]: provider.maxTokens || request.maxTokens,
        messages: [
            { role: 'system', content: request.instructions },
            { role: 'user', content: request.input },
        ],
        response_format: provider.jsonSchema
            ? {
                type: 'json_schema',
                json_schema: {
                    name: request.schemaName,
                    strict: true,
                    schema: request.schema,
                },
            }
            : { type: 'json_object' },
    });
    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') {
        throw new Error('réponse tronquée : max_tokens atteint');
    }
    const content = choice?.message?.content;
    if (!content)
        throw new Error('réponse vide');
    return content;
};
exports.chatCompletionsTransport = chatCompletionsTransport;
let LlmService = LlmService_1 = class LlmService {
    config;
    transport;
    logger = new common_1.Logger(LlmService_1.name);
    constructor(config, transport) {
        this.config = config;
        this.transport = transport;
    }
    providers() {
        const order = (this.config.get('LLM_PROVIDERS') || DEFAULT_ORDER)
            .split(',')
            .map((name) => name.trim().toLowerCase())
            .filter((name) => name in DEFAULTS);
        return [...new Set(order)]
            .map((name) => {
            const prefix = name.toUpperCase();
            const apiKey = this.config.get(`${prefix}_API_KEY`);
            if (!apiKey)
                return null;
            const flag = this.config.get(`${prefix}_JSON_SCHEMA`);
            const tokenParam = this.config.get(`${prefix}_TOKEN_PARAM`);
            const budget = Number(this.config.get(`${prefix}_MAX_TOKENS`) ||
                this.config.get('LLM_MAX_TOKENS'));
            const timeout = Number(this.config.get(`${prefix}_TIMEOUT_MS`) ||
                this.config.get('LLM_TIMEOUT_MS'));
            return {
                name,
                apiKey,
                baseURL: this.config.get(`${prefix}_BASE_URL`) ||
                    DEFAULTS[name].baseURL,
                model: this.config.get(`${prefix}_MODEL`) || DEFAULTS[name].model,
                jsonSchema: flag === undefined || flag === ''
                    ? DEFAULTS[name].jsonSchema
                    : flag === 'true',
                timeoutMs: Number.isFinite(timeout) && timeout > 0
                    ? timeout
                    : DEFAULTS[name].timeoutMs || DEFAULT_TIMEOUT_MS,
                tokenParam: tokenParam === 'max_tokens' ||
                    tokenParam === 'max_completion_tokens'
                    ? tokenParam
                    : DEFAULTS[name].tokenParam,
                maxTokens: Number.isFinite(budget) && budget > 0
                    ? budget
                    : DEFAULTS[name].maxTokens,
            };
        })
            .filter((provider) => provider !== null);
    }
    async completeJson(request) {
        const providers = this.providers();
        if (!providers.length) {
            throw new common_1.ServiceUnavailableException('Aucun fournisseur configuré : renseigner KIMI_API_KEY, OPENAI_API_KEY ou GEMINI_API_KEY');
        }
        const failures = [];
        for (const provider of providers) {
            try {
                const raw = await this.transport(provider, request);
                const value = this.parse(raw);
                if (failures.length) {
                    this.logger.warn(`Repli sur ${provider.name} après ${failures.join(' ; ')}`);
                }
                return { value, provider: provider.name };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'erreur inconnue';
                this.logger.warn(`${provider.name} indisponible : ${message}`);
                failures.push(`${provider.name} (${message})`);
            }
        }
        throw new common_1.ServiceUnavailableException(`Aucun fournisseur n’a répondu — ${failures.join(' ; ')}`);
    }
    parse(raw) {
        const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end <= start)
            throw new Error('réponse sans objet JSON');
        return JSON.parse(text.slice(start, end + 1));
    }
};
exports.LlmService = LlmService;
exports.LlmService = LlmService = LlmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(exports.LLM_TRANSPORT)),
    __metadata("design:paramtypes", [config_1.ConfigService, Function])
], LlmService);
//# sourceMappingURL=llm.service.js.map