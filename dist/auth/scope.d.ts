import { Prisma } from '@prisma/client';
import type { CurrentUser } from './current-user';
export type Scope = {
    ownerId: string;
} | null;
export declare function scopeOf(user: CurrentUser | null | undefined): Scope;
export declare const seesEverything: (scope: Scope) => scope is null;
export declare function ownedWhere(scope: Scope): {
    ownerId: string;
} | {
    ownerId?: undefined;
};
export declare const profileWhere: (scope: Scope) => Prisma.ProfileWhereInput;
export declare const ingestWhere: (scope: Scope) => Prisma.SourceIngestWhereInput;
export declare const groupWhere: (scope: Scope) => Prisma.GroupWhereInput;
export declare const siteWhere: (scope: Scope) => Prisma.ContentSourceWhereInput;
export declare const groupManageWhere: (scope: Scope) => Prisma.GroupWhereInput;
export declare const siteManageWhere: (scope: Scope) => Prisma.ContentSourceWhereInput;
export declare const postWhere: (scope: Scope) => Prisma.PostWhereInput;
export declare const articleWhere: (scope: Scope) => Prisma.ArticleWhereInput;
export declare const jobWhere: (scope: Scope) => Prisma.PublicationJobWhereInput;
export declare const logWhere: (scope: Scope) => Prisma.ActivityLogWhereInput;
export declare function withScope<T extends object>(scope: Scope, filters: T): T;
