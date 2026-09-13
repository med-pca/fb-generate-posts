import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';
export declare class LogsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateLogDto): Prisma.Prisma__ActivityLogClient<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        metadata: Prisma.JsonValue | null;
        postId: string | null;
        postTargetId: string | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        jobId: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findAll(profileId?: string): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        metadata: Prisma.JsonValue | null;
        postId: string | null;
        postTargetId: string | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        jobId: string | null;
    }[]>;
}
