import { PrismaService } from '../prisma/prisma.service';
import { ImportJsonDto } from './dto/import-json.dto';
export declare class ImportsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    importJson(dto: ImportJsonDto): Promise<{
        received: number;
        imported: number;
        duplicates: number;
    }>;
}
