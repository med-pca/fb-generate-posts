import { ConfigService } from '@nestjs/config';
export type LlmProvider = {
    name: string;
    apiKey: string;
    baseURL?: string;
    model: string;
    jsonSchema: boolean;
    timeoutMs: number;
    tokenParam: 'max_tokens' | 'max_completion_tokens';
    maxTokens: number;
};
export type JsonRequest = {
    instructions: string;
    input: string;
    schemaName: string;
    schema: Record<string, unknown>;
    maxTokens: number;
};
export type LlmTransport = (provider: LlmProvider, request: JsonRequest) => Promise<string>;
export declare const LLM_TRANSPORT: unique symbol;
export declare const chatCompletionsTransport: LlmTransport;
export declare class LlmService {
    private readonly config;
    private readonly transport;
    private readonly logger;
    constructor(config: ConfigService, transport: LlmTransport);
    providers(): LlmProvider[];
    completeJson<T>(request: JsonRequest): Promise<{
        value: T;
        provider: string;
    }>;
    private parse;
}
