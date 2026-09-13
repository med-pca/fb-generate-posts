export declare function paginated<T>(data: T[], total: number, page: number, limit: number): {
    data: T[];
    meta: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
};
