import { CreateLogDto } from './dto/create-log.dto';
import { LogsService } from './logs.service';
export declare class LogsController {
    private readonly logs;
    constructor(logs: LogsService);
    create(dto: CreateLogDto): import("@prisma/client").Prisma.Prisma__ActivityLogClient<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        postId: string | null;
        postTargetId: string | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        jobId: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(profileId?: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        profileId: string | null;
        groupId: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        postId: string | null;
        postTargetId: string | null;
        eventType: string;
        level: import("@prisma/client").$Enums.LogLevel;
        message: string;
        jobId: string | null;
    }[]>;
}
