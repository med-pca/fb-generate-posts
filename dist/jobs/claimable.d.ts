import { Prisma } from '@prisma/client';
export type ClaimProfile = {
    id: string;
    ownerId: string | null;
    owner?: {
        role: string;
    } | null;
};
export type ClaimPost = {
    profileId?: string | null;
    ownerId: string | null;
    owner?: {
        role: string;
    } | null;
    article?: {
        source: {
            access: Array<{
                userId: string;
            }>;
        };
    } | null;
};
export declare const isHouseProfile: (profile: ClaimProfile) => boolean;
export declare function mayPublishPost(profile: ClaimProfile, post: ClaimPost): boolean;
export declare function claimablePostWhere(profile: ClaimProfile): Prisma.PostWhereInput;
export declare function profilesForPostWhere(post: ClaimPost): Prisma.ProfileWhereInput;
export declare const publishableArticleWhere: Prisma.PostWhereInput;
