import { PrismaService } from '../prisma/prisma.service';
export declare function categoryName(raw: string): string;
export declare class CategoriesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<{
        groups: number;
        sites: number;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
    }[]>;
    create(raw: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
    }>;
    rename(id: string, raw: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        deleted: boolean;
        released: {
            groups: number;
            sites: number;
        };
    }>;
    resolve(categoryId: string | undefined): Promise<string | null | undefined>;
    private load;
    private assertFree;
}
