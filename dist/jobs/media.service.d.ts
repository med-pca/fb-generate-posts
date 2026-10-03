import { PrismaService } from '../prisma/prisma.service';
export declare class MediaService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    fetchPostImage(rawUrl: string): Promise<{
        buffer: Buffer<ArrayBuffer>;
        type: string;
    }>;
}
