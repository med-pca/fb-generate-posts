import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
export declare const CODE_RE: RegExp;
export declare const NAME_RE: RegExp;
export declare class LanguagesService implements OnModuleInit {
    private readonly prisma;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    private refresh;
    list(): Promise<{
        code: string;
        name: string;
        groups: number;
        visuals: number;
    }[]>;
    private clean;
    private log;
    private unique;
    create(dto: {
        code: string;
        name: string;
    }, acting: CurrentUser | null): Promise<{
        code: string | undefined;
        name: string | undefined;
    }>;
    update(code: string, dto: {
        code?: string;
        name?: string;
    }, acting: CurrentUser | null): Promise<{
        code: string;
        name: string;
    }>;
    remove(code: string, detach: boolean, acting: CurrentUser | null): Promise<{
        deleted: string;
        groups: number;
        visuals: number;
    }>;
    names(): {
        [x: string]: string;
    };
}
