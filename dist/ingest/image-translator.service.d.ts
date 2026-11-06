import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export type ImageData = {
    data: string;
    mimeType: string;
};
export declare const IMAGE_PROVIDER_NAMES: readonly ["openai", "qwen", "seedream"];
export type ImageProviderName = (typeof IMAGE_PROVIDER_NAMES)[number];
export { LANGUAGES, languageName } from '../languages/languages.registry';
export declare function editPrompt(language: string, texts?: string[]): string;
export declare class ImageTranslatorService {
    private readonly config;
    private readonly prisma?;
    private readonly logger;
    constructor(config: ConfigService, prisma?: PrismaService | undefined);
    private setting;
    private overrides;
    private loadedAt;
    load(force?: boolean): Promise<void>;
    private resolved;
    providers(): {
        name: "openai" | "qwen" | "seedream";
        label: "OpenAI GPT Image" | "Alibaba Qwen Image" | "ByteDance Seedream";
        model: string;
        configured: boolean;
        keySource: "plateforme" | "serveur" | null;
        keyHint: string | null;
        baseUrl: string | null;
        defaultModel: "gpt-image-1-mini" | "qwen-image-edit" | "seedream-4-0-250828";
        defaultBaseUrl: "https://dashscope-intl.aliyuncs.com" | "https://ark.ap-southeast.bytepluses.com" | null;
        updatedAt: Date | null;
        updatedBy: string | null;
    }[];
    configure(name: string, input: {
        apiKey?: string;
        clearKey?: boolean;
        model?: string | null;
        baseUrl?: string | null;
    }, by: string | null): Promise<{
        name: "openai" | "qwen" | "seedream";
        label: "OpenAI GPT Image" | "Alibaba Qwen Image" | "ByteDance Seedream";
        model: string;
        configured: boolean;
        keySource: "plateforme" | "serveur" | null;
        keyHint: string | null;
        baseUrl: string | null;
        defaultModel: "gpt-image-1-mini" | "qwen-image-edit" | "seedream-4-0-250828";
        defaultBaseUrl: "https://dashscope-intl.aliyuncs.com" | "https://ark.ap-southeast.bytepluses.com" | null;
        updatedAt: Date | null;
        updatedBy: string | null;
    } | undefined>;
    order(preferred: string): {
        name: "openai" | "qwen" | "seedream";
        label: "OpenAI GPT Image" | "Alibaba Qwen Image" | "ByteDance Seedream";
        model: string;
        configured: boolean;
        keySource: "plateforme" | "serveur" | null;
        keyHint: string | null;
        baseUrl: string | null;
        defaultModel: "gpt-image-1-mini" | "qwen-image-edit" | "seedream-4-0-250828";
        defaultBaseUrl: "https://dashscope-intl.aliyuncs.com" | "https://ark.ap-southeast.bytepluses.com" | null;
        updatedAt: Date | null;
        updatedBy: string | null;
    }[];
    translate(image: ImageData, language: string, texts?: string[], preferred?: string): Promise<ImageData & {
        provider: string;
    }>;
    private openai;
    private qwen;
    private seedream;
    private download;
}
