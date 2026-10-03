import type { CurrentUser } from '../auth/current-user';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
import { FacebookUrlDto, ForceTargetDto, OptionalFacebookUrlDto, PriorityDto, QueueQueryDto } from './dto/queue.dto';
import { QueueService } from './queue.service';
export declare class PostsController {
    private readonly posts;
    private readonly queueService;
    constructor(posts: PostsService, queueService: QueueService);
    queue(query: QueueQueryDto, acting: CurrentUser): Promise<{
        counts: {
            running: number;
            upcoming: number;
            published: number;
            failed: number;
        };
        running: {
            targetId: string;
            state: string;
            since: Date | null;
            expiresAt: Date | null;
            post: {
                article: {
                    id: string;
                    title: string;
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                imageUrl: string | null;
                priority: number;
            };
            group: {
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                url: string;
            };
            profile: {
                id: string;
                name: string;
                externalId: string | null;
            };
            jobId: string;
        }[];
        upcoming: {
            rank: number;
            targetId: string;
            post: {
                article: {
                    id: string;
                    title: string;
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                imageUrl: string | null;
                priority: number;
            };
            group: Omit<{
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                profiles: {
                    profile: {
                        id: string;
                        name: string;
                        externalId: string | null;
                    };
                }[];
                url: string;
                _count: {
                    profiles: number;
                };
            }, "profiles" | "_count"> & {
                pendingJoins: number;
            };
            candidates: {
                id: string;
                name: string;
                externalId: string | null;
            }[];
            forcedProfile: {
                id: string;
                name: string;
                externalId: string | null;
            } | null;
            forcedAt: Date | null;
        }[];
        failed: {
            targetId: string;
            failedAt: Date;
            attempts: number;
            error: string;
            post: {
                article: {
                    id: string;
                    title: string;
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                imageUrl: string | null;
                priority: number;
            };
            group: Omit<{
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                profiles: {
                    profile: {
                        id: string;
                        name: string;
                        externalId: string | null;
                    };
                }[];
                url: string;
                _count: {
                    profiles: number;
                };
            }, "profiles" | "_count"> & {
                pendingJoins: number;
            };
            profile: {
                id: string;
                name: string;
                externalId: string | null;
            };
            candidates: {
                id: string;
                name: string;
                externalId: string | null;
            }[];
        }[];
        published: {
            targetId: string;
            publishedAt: Date | null;
            post: {
                article: {
                    id: string;
                    title: string;
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                url: string | null;
                imageUrl: string | null;
                priority: number;
            };
            group: {
                category: {
                    id: string;
                    name: string;
                } | null;
                id: string;
                name: string;
                url: string;
            };
            profile: {
                id: string;
                name: string;
                externalId: string | null;
            };
            facebookUrl: string | null;
            verify: {
                status: import("@prisma/client").$Enums.VerifyStatus | null;
                at: Date | null;
                detail: string | null;
                republishCount: number;
            };
            link: string;
        }[];
    }>;
    retry(targetId: string, acting: CurrentUser): Promise<{
        targetId: string;
        status: "AVAILABLE";
    }>;
    markPublished(targetId: string, dto: OptionalFacebookUrlDto, acting: CurrentUser): Promise<{
        targetId: string;
        status: "PUBLISHED";
    }>;
    setFacebookUrl(targetId: string, dto: FacebookUrlDto, acting: CurrentUser): Promise<{
        targetId: string;
        facebookUrl: string;
    }>;
    history(targetId: string, acting: CurrentUser): Promise<{
        attempts: {
            at: Date;
            status: import("@prisma/client").$Enums.TargetStatus;
            profile: {
                id: string;
                name: string;
            };
            jobId: string;
            facebookUrl: string | null;
            publishedAt: Date | null;
            commentId: string | null;
            linkPlacedAt: Date | null;
            error: string | null;
        }[];
        events: {
            at: Date;
            kind: string;
            label: "Publié" | "Publié sans adresse Facebook" | "Commentaire posé" | "Lien de l’article posé" | "Échec de publication" | "Relancé" | "Marqué publié à la main" | "Adresse Facebook enregistrée" | "Adresse retrouvée par le vérificateur" | "Vérifié : en ligne avec son lien" | "Vérifié : en attente de validation" | "Vérification impossible" | "Vérifié : introuvable" | "Vérifié : en ligne sans son lien" | "Supprimé par le vérificateur" | "Suppression impossible" | "Remis dans la file" | "À traiter" | "Validé à la main";
            facebookUrl: string | null;
            actor: string | null;
            detail: string | null;
        }[];
        group: {
            id: string;
            name: string;
            url: string;
        };
        post: {
            id: string;
            title: string;
            url: string | null;
            imageUrl: string | null;
        };
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        publishedAt: Date | null;
        attemptsCount: number;
        verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
        verifiedAt: Date | null;
        verifyDetail: string | null;
        republishCount: number;
        facebookUrl: string | null;
    }>;
    findByUrl(url: string, acting: CurrentUser): Promise<{
        targetId: string;
        current: boolean;
        group: {
            id: string;
            name: string;
        };
        post: {
            id: string;
            title: string;
        };
        id: string;
        status: import("@prisma/client").$Enums.TargetStatus;
        verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
        facebookUrl: string | null;
    }[]>;
    removeTarget(targetId: string, acting: CurrentUser): Promise<{
        removed: boolean;
        postDeleted: boolean;
    }>;
    force(targetId: string, dto: ForceTargetDto, acting: CurrentUser): Promise<{
        targetId: string;
        forcedProfile: null;
        warning: null;
        runnerMode?: undefined;
    } | {
        targetId: string;
        forcedProfile: {
            id: string;
            name: string;
        };
        runnerMode: import("@prisma/client").$Enums.RunnerMode;
        warning: string | null;
    }>;
    setPriority(id: string, dto: PriorityDto, acting: CurrentUser): Promise<{
        id: string;
        priority: number;
    }>;
    create(dto: CreatePostDto, acting: CurrentUser): Promise<{
        targets: {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.TargetStatus;
            updatedAt: Date;
            publishedAt: Date | null;
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            commentExternalId: string | null;
            commentedAt: Date | null;
            linkUpdatedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
            forcedAt: Date | null;
            verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
            verifiedAt: Date | null;
            verifyDetail: string | null;
            verifyClaimedUntil: Date | null;
            verifyAttempts: number;
            republishCount: number;
            facebookUrl: string | null;
            groupId: string;
            forcedProfileId: string | null;
            postId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        ownerId: string | null;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
        priority: number;
    }>;
    findAll(query: QueryPostsDto, acting: CurrentUser): Promise<{
        data: ({
            targets: ({
                group: {
                    id: string;
                    createdAt: Date;
                    name: string;
                    status: import("@prisma/client").$Enums.RecordStatus;
                    updatedAt: Date;
                    ownerId: string | null;
                    externalId: string | null;
                    categoryId: string | null;
                    url: string;
                };
            } & {
                id: string;
                createdAt: Date;
                status: import("@prisma/client").$Enums.TargetStatus;
                updatedAt: Date;
                publishedAt: Date | null;
                claimedAt: Date | null;
                claimExpiresAt: Date | null;
                consumedAt: Date | null;
                commentExternalId: string | null;
                commentedAt: Date | null;
                linkUpdatedAt: Date | null;
                attemptsCount: number;
                lastError: string | null;
                forcedAt: Date | null;
                verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
                verifiedAt: Date | null;
                verifyDetail: string | null;
                verifyClaimedUntil: Date | null;
                verifyAttempts: number;
                republishCount: number;
                facebookUrl: string | null;
                groupId: string;
                forcedProfileId: string | null;
                postId: string;
            })[];
        } & {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.PostStatus;
            updatedAt: Date;
            description: string;
            title: string;
            ownerId: string | null;
            externalId: string | null;
            url: string | null;
            rawData: import("@prisma/client/runtime/library").JsonValue | null;
            profileId: string | null;
            imageUrl: string | null;
            delay: number;
            sourceType: import("@prisma/client").$Enums.SourceType;
            articleId: string | null;
            socialAngle: string | null;
            priority: number;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    bulkRemove(dto: BulkDeletePostsDto, acting: CurrentUser): Promise<{
        dryRun: boolean;
        matched: number;
        deleted: number;
        blocked: number;
        blockedPosts: {
            id: string;
            title: string;
        }[];
    }>;
    findOne(id: string, acting: CurrentUser): Promise<{
        profile: {
            id: string;
            createdAt: Date;
            name: string;
            status: import("@prisma/client").$Enums.RecordStatus;
            updatedAt: Date;
            ownerId: string | null;
            externalId: string | null;
            defaultImageUrl: string | null;
            minPostsPerJob: number;
            maxPostsPerJob: number;
            minimumAvailable: number | null;
            minimumAvailablePerGroup: number | null;
            isModerator: boolean;
            facebookUserId: string | null;
            facebookName: string | null;
            facebookSeenAt: Date | null;
        } | null;
        targets: ({
            group: {
                id: string;
                createdAt: Date;
                name: string;
                status: import("@prisma/client").$Enums.RecordStatus;
                updatedAt: Date;
                ownerId: string | null;
                externalId: string | null;
                categoryId: string | null;
                url: string;
            };
        } & {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.TargetStatus;
            updatedAt: Date;
            publishedAt: Date | null;
            claimedAt: Date | null;
            claimExpiresAt: Date | null;
            consumedAt: Date | null;
            commentExternalId: string | null;
            commentedAt: Date | null;
            linkUpdatedAt: Date | null;
            attemptsCount: number;
            lastError: string | null;
            forcedAt: Date | null;
            verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
            verifiedAt: Date | null;
            verifyDetail: string | null;
            verifyClaimedUntil: Date | null;
            verifyAttempts: number;
            republishCount: number;
            facebookUrl: string | null;
            groupId: string;
            forcedProfileId: string | null;
            postId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        ownerId: string | null;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
        priority: number;
    }>;
    update(id: string, dto: UpdatePostDto, acting: CurrentUser): Promise<{
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        ownerId: string | null;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
        priority: number;
    }>;
    remove(id: string, acting: CurrentUser, force?: string): Promise<{
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        ownerId: string | null;
        externalId: string | null;
        url: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        socialAngle: string | null;
        priority: number;
    }>;
}
