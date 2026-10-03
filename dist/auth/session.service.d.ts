import { PrismaService } from '../prisma/prisma.service';
export declare const SESSION_HOURS = 12;
export declare const IDLE_MINUTES = 120;
export declare class SessionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(userId: string, meta: {
        ip?: string | null;
        userAgent?: string | null;
    }, now?: Date): Promise<{
        token: string;
        expiresAt: Date;
        maxAgeSeconds: number;
    }>;
    validate(token: string, now?: Date): Promise<{
        sessionId: string;
        user: {
            id: string;
            createdAt: Date;
            username: string;
            passwordHash: string;
            role: import("@prisma/client").$Enums.Role;
            status: import("@prisma/client").$Enums.RecordStatus;
            automationKey: string;
            nstApiKey: string | null;
            updatedAt: Date;
        };
    } | null>;
    revoke(token: string, now?: Date): Promise<void>;
    revokeAll(userId: string, now?: Date): Promise<number>;
    purge(now?: Date): Promise<void>;
}
