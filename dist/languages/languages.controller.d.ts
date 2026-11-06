import type { CurrentUser } from '../auth/current-user';
import { LanguagesService } from './languages.service';
export declare class CreateLanguageDto {
    code: string;
    name: string;
}
export declare class UpdateLanguageDto {
    code?: string;
    name?: string;
}
export declare class LanguagesController {
    private readonly languages;
    constructor(languages: LanguagesService);
    list(): Promise<{
        code: string;
        name: string;
        groups: number;
        visuals: number;
    }[]>;
    create(dto: CreateLanguageDto, acting: CurrentUser): Promise<{
        code: string | undefined;
        name: string | undefined;
    }>;
    update(code: string, dto: UpdateLanguageDto, acting: CurrentUser): Promise<{
        code: string;
        name: string;
    }>;
    remove(code: string, detach: string | undefined, acting: CurrentUser): Promise<{
        deleted: string;
        groups: number;
        visuals: number;
    }>;
}
