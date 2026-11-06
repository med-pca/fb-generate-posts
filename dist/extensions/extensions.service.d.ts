import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import type { ExtensionDef } from './catalog';
type StoredFile = {
    path: string;
    b64: string;
};
export declare function versionOf(def: ExtensionDef, files: StoredFile[]): string;
export declare class ExtensionsService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    snapshot(def: ExtensionDef, root?: string): Promise<{
        version: string;
        files: StoredFile[];
        sha256: string;
        size: number;
    }>;
    importArchive(root?: string): Promise<string[]>;
    syncAll(root?: string): Promise<string[]>;
    list(): Promise<{
        key: string;
        name: string;
        letter: string;
        color: string;
        role: string;
        installOn: string;
        kind: "wordpress" | "agent" | "chrome";
        installHint: string | null;
        preconfigurable: boolean;
        nstKey: "required" | "useful" | null;
        nstKeyWhy: string | null;
        current: {
            id: string;
            createdAt: Date;
            sha256: string;
            notes: string | null;
            size: number;
            version: string;
            key: string;
            fileCount: number;
            pinned: boolean;
        };
        pinned: boolean;
        releases: {
            id: string;
            createdAt: Date;
            sha256: string;
            notes: string | null;
            size: number;
            version: string;
            key: string;
            fileCount: number;
            pinned: boolean;
        }[];
    }[]>;
    private def;
    download(key: string, version: string, opts: {
        preset: boolean;
        origin: string;
    }, acting: CurrentUser): Promise<{
        fileName: string;
        zip: Buffer<ArrayBuffer>;
    }>;
    pin(key: string, version: string | null, acting: CurrentUser): Promise<{
        key: string;
        pinned: string | null;
    }>;
}
export {};
