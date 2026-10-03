import { CategoriesService } from './categories.service';
import { CategoryDto } from './dto/category.dto';
export declare class CategoriesController {
    private readonly categories;
    constructor(categories: CategoriesService);
    findAll(): Promise<{
        groups: number;
        sites: number;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
    }[]>;
    create(dto: CategoryDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
    }>;
    rename(id: string, dto: CategoryDto): Promise<{
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
}
