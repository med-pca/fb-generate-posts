import { PrismaService } from './prisma/prisma.service';
export declare class AppService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getHello(): string;
    health(): Promise<{
        status: string;
        database: string;
    }>;
}
