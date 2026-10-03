declare class JsonPostDto {
    externalId?: string;
    title: string;
    description: string;
    url?: string;
    imageUrl?: string;
    delay: number;
}
export declare class ImportJsonDto {
    groupIds: string[];
    posts: JsonPostDto[];
}
export {};
