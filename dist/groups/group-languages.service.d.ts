import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { LlmService } from '../llm/llm.service';
export declare class GroupLanguagesService {
    private readonly prisma;
    private readonly llm?;
    constructor(prisma: PrismaService, llm?: LlmService | undefined);
    summary(acting: CurrentUser | null): Promise<{
        languages: {
            [x: string]: string;
        };
        counts: {
            code: string | null;
            groups: number;
        }[];
    }>;
    setMany(dto: {
        groupIds?: string[];
        categoryId?: string;
        onlyMissing?: boolean;
        language: string | null;
    }, acting: CurrentUser | null): Promise<{
        updated: number;
    }>;
    suggest(acting: CurrentUser | null, categoryId?: string): Promise<{
        suggestions: {
            id: string;
            name: string;
            language: string | null;
            by: string;
        }[];
        languages: {
            [x: string]: string;
        };
    }>;
}
