import { PrismaService } from '../prisma/prisma.service';
import { ImportJsonDto } from './dto/import-json.dto';
import type { CurrentUser } from '../auth/current-user';
export declare class ImportsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    importJson(dto: ImportJsonDto, acting?: CurrentUser | null): Promise<{
        received: number;
        imported: number;
        duplicates: number;
    }>;
}
