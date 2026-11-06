import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CurrentUser } from '../auth/current-user';
import { ExtensionsService } from './extensions.service';
export declare class ExtensionsController {
    private readonly extensions;
    constructor(extensions: ExtensionsService);
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
    download(key: string, version: string, preset: string | undefined, acting: CurrentUser, request: FastifyRequest, reply: FastifyReply): Promise<never>;
    sync(): Promise<string[]>;
    pin(key: string, body: {
        version?: string | null;
    }, acting: CurrentUser): Promise<{
        key: string;
        pinned: string | null;
    }>;
}
