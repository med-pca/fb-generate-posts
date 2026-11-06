import type { FastifyReply } from 'fastify';
import type { CurrentUser } from '../auth/current-user';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { BulkDeletePostsDto } from './dto/bulk-delete-posts.dto';
import { BulkRepeatDto } from './dto/repeat.dto';
import { AttachFacebookUrlDto, FacebookUrlDto, ForceTargetDto, OptionalFacebookUrlDto, PriorityDto, QueueQueryDto } from './dto/queue.dto';
import { ShortCacheService } from '../perf/short-cache.service';
import { QueueService } from './queue.service';
import { PublishedService } from './published.service';
import { PrioritiesService } from './priorities.service';
import { GroupLimitsDto, PublishedQueryDto } from './dto/queue.dto';
export declare class PostsController {
    private readonly posts;
    private readonly queueService;
    private readonly publishedService;
    private readonly priorities;
    private readonly cache;
    constructor(posts: PostsService, queueService: QueueService, publishedService: PublishedService, priorities: PrioritiesService, cache: ShortCacheService);
    prioritiesOverview(acting: CurrentUser): Promise<{
        settings: {
            rateLimitPauseDays: number;
            imageProvider: string;
        };
        groups: {
            waiting: number;
            publishedToday: number;
            category: {
                id: string;
                name: string;
            } | null;
            language: string | null;
            id: string;
            name: string;
            priority: number;
            url: string;
            dailyCap: number | null;
            hoursStart: number | null;
            hoursEnd: number | null;
        }[];
        articles: {
            site: string;
            source: undefined;
            waiting: number;
            id: string;
            title: string;
            priority: number;
            articleUrl: string;
            coverImageUrl: string | null;
            publishedAt: Date | null;
        }[];
    }>;
    groupPriority(id: string, dto: PriorityDto, acting: CurrentUser): Promise<{
        id: string;
        priority: number;
    }>;
    groupLimits(id: string, dto: GroupLimitsDto, acting: CurrentUser): Promise<{
        hoursStart: number;
        hoursEnd: number;
        dailyCap: number | null;
        id: string;
    } | {
        hoursStart: null;
        hoursEnd: null;
        dailyCap: number | null;
        id: string;
    }>;
    articlePriority(id: string, dto: PriorityDto, acting: CurrentUser): Promise<{
        id: string;
        priority: number;
        posts: number;
    }>;
    published(query: PublishedQueryDto, acting: CurrentUser): Promise<{
        timeZone: string;
        total: number;
        truncated: boolean;
        summary: {
            total: number;
            withUrl: number;
            verify: {
                [k: string]: number;
            };
            link: {
                [k: string]: number;
            };
            missingWhy: {
                [k: string]: number;
            };
            byProfile: {
                id: string;
                name: string;
                count: number;
            }[];
            byGroup: {
                id: string;
                name: string;
                count: number;
            }[];
            byDay: {
                day: string;
                count: number;
            }[];
            byHour: number[];
        };
        rows: {
            targetId: string;
            publishedAt: Date | null;
            post: {
                id: string;
                title: string;
                priority: number;
                url: string | null;
                imageUrl: string | null;
                articleId: string | null;
                visualId: string | null;
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
                id: null;
                name: string;
            } | {
                id: string;
                name: string;
            } | null;
            facebookUrl: string | null;
            link: "none" | "missing" | "placed" | "waiting";
            why: {
                code: import("./link-why").MissingWhy;
                title: string;
                detail: string;
                todo: string;
            } | null;
            verify: {
                status: import("@prisma/client").$Enums.VerifyStatus | null;
                at: Date | null;
                detail: string | null;
                republishCount: number;
            };
            repeatRound: number;
        }[];
        page: number;
        limit: number;
    }>;
    publishedCsv(query: PublishedQueryDto, acting: CurrentUser, reply: FastifyReply): Promise<never>;
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
                    source: {
                        access: {
                            userId: string;
                        }[];
                    };
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                priority: number;
                ownerId: string | null;
                owner: {
                    role: import("@prisma/client").$Enums.Role;
                } | null;
                profileId: string | null;
                imageUrl: string | null;
                visualId: string | null;
                noComment: boolean;
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
            } | {
                id: null;
                name: string;
                externalId: null;
            } | null;
            jobId: string;
        }[];
        upcoming: {
            rank: number;
            targetId: string;
            post: {
                article: {
                    id: string;
                    title: string;
                    source: {
                        access: {
                            userId: string;
                        }[];
                    };
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                priority: number;
                ownerId: string | null;
                owner: {
                    role: import("@prisma/client").$Enums.Role;
                } | null;
                profileId: string | null;
                imageUrl: string | null;
                visualId: string | null;
                noComment: boolean;
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
                        ownerId: string | null;
                        externalId: string | null;
                        owner: {
                            role: import("@prisma/client").$Enums.Role;
                        } | null;
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
            avoidProfile: {
                id: string;
                name: string;
                ownerId: string | null;
                externalId: string | null;
                owner: {
                    role: import("@prisma/client").$Enums.Role;
                } | null;
            } | {
                id: null;
                name: string;
                externalId: null;
            } | null;
            forcedProfile: {
                id: string;
                name: string;
                externalId: string | null;
            } | {
                id: null;
                name: string;
                externalId: null;
            } | null;
            forcedAt: Date | null;
            repeatRound: number;
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
                    source: {
                        access: {
                            userId: string;
                        }[];
                    };
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                priority: number;
                ownerId: string | null;
                owner: {
                    role: import("@prisma/client").$Enums.Role;
                } | null;
                profileId: string | null;
                imageUrl: string | null;
                visualId: string | null;
                noComment: boolean;
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
                        ownerId: string | null;
                        externalId: string | null;
                        owner: {
                            role: import("@prisma/client").$Enums.Role;
                        } | null;
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
            } | {
                id: null;
                name: string;
                externalId: null;
            } | null;
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
                    source: {
                        access: {
                            userId: string;
                        }[];
                    };
                } | null;
                id: string;
                createdAt: Date;
                description: string;
                title: string;
                priority: number;
                ownerId: string | null;
                owner: {
                    role: import("@prisma/client").$Enums.Role;
                } | null;
                url: string | null;
                profileId: string | null;
                imageUrl: string | null;
                visualId: string | null;
                noComment: boolean;
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
            } | {
                id: null;
                name: string;
                externalId: null;
            } | null;
            facebookUrl: string | null;
            repeatRound: number;
            verify: {
                status: import("@prisma/client").$Enums.VerifyStatus | null;
                at: Date | null;
                detail: string | null;
                republishCount: number;
            };
            link: string;
            why: {
                code: import("./link-why").MissingWhy;
                title: string;
                detail: string;
                todo: string;
            } | null;
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
            label: "Publié" | "Publié sans adresse Facebook" | "Commentaire posé" | "Lien de l’article posé" | "Échec de publication" | "Relancé" | "Marqué publié à la main" | "Adresse Facebook enregistrée" | "Adresse retrouvée par le vérificateur" | "Lien collé à la main : publication retrouvée et complétée" | "Vérifié : en ligne avec son lien" | "Vérifié : en attente de validation" | "Soumis : en attente de validation par l’administrateur du groupe" | "Validé par l’administrateur du groupe : visible" | "Non validé en 24 h" | "Vérification impossible" | "Vérifié : introuvable" | "Vérifié : en ligne sans son lien" | "Supprimé par le vérificateur" | "Suppression impossible" | "Remis dans la file" | "Republication programmée (duplication)" | "Recréé à la main depuis l’article" | "À traiter" | "Validé à la main" | "🛟 Lien manquant : sauvetage demandé à un autre profil du groupe" | "🛟 Lien posé par un profil sauveteur" | "🛟 Sauvetage impossible : le vérificateur reprend la main";
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
        repeatRound: number;
        facebookUrl: string | null;
    }>;
    attachUrl(dto: AttachFacebookUrlDto, acting: CurrentUser): Promise<{
        result: "attached";
        facebookUrl: string;
        targetId: string;
        previousStatus: import("@prisma/client").$Enums.TargetStatus;
        post: {
            title: string;
        };
        group: {
            name: string;
        };
        rescue: boolean;
    } | {
        result: "known";
        facebookUrl: string;
        targets: {
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
        }[];
        groups?: undefined;
        candidates?: undefined;
    } | {
        result: "choose";
        facebookUrl: string;
        groups: string[];
        candidates: {
            targetId: string;
            missingLink: boolean;
            group: {
                id: string;
                name: string;
            };
            post: {
                id: string;
                title: string;
                imageUrl: string | null;
            };
            status: import("@prisma/client").$Enums.TargetStatus;
            updatedAt: Date;
            publishedAt: Date | null;
            approvalPendingSince: Date | null;
            lastError: string | null;
        }[];
        targets?: undefined;
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
            approvalPendingSince: Date | null;
            approvalCheckedAt: Date | null;
            approvalChecks: number;
            approvalModClaimedUntil: Date | null;
            approvalModAttempts: number;
            attemptsCount: number;
            lastError: string | null;
            forcedAt: Date | null;
            verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
            verifiedAt: Date | null;
            verifyDetail: string | null;
            verifyClaimedUntil: Date | null;
            verifyAttempts: number;
            republishCount: number;
            avoidProfileId: string | null;
            repeatRound: number;
            facebookUrl: string | null;
            rescueStatus: string | null;
            rescueProfileId: string | null;
            rescueClaimedUntil: Date | null;
            rescueAttempts: number;
            rescueTriedBy: string[];
            rescueRequestedAt: Date | null;
            rescueDoneAt: Date | null;
            rescueDetail: string | null;
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
        priority: number;
        ownerId: string | null;
        externalId: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        url: string | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        visualId: string | null;
        socialAngle: string | null;
        noComment: boolean;
        repeatTimes: number | null;
        repeatEveryHours: number | null;
    }>;
    findAll(query: QueryPostsDto, acting: CurrentUser): Promise<{
        data: ({
            targets: ({
                group: {
                    language: string | null;
                    id: string;
                    createdAt: Date;
                    name: string;
                    status: import("@prisma/client").$Enums.RecordStatus;
                    updatedAt: Date;
                    categoryId: string | null;
                    priority: number;
                    ownerId: string | null;
                    externalId: string | null;
                    url: string;
                    spamCheckedAt: Date | null;
                    spamClaimedUntil: Date | null;
                    spamDetail: string | null;
                    dailyCap: number | null;
                    hoursStart: number | null;
                    hoursEnd: number | null;
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
                approvalPendingSince: Date | null;
                approvalCheckedAt: Date | null;
                approvalChecks: number;
                approvalModClaimedUntil: Date | null;
                approvalModAttempts: number;
                attemptsCount: number;
                lastError: string | null;
                forcedAt: Date | null;
                verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
                verifiedAt: Date | null;
                verifyDetail: string | null;
                verifyClaimedUntil: Date | null;
                verifyAttempts: number;
                republishCount: number;
                avoidProfileId: string | null;
                repeatRound: number;
                facebookUrl: string | null;
                rescueStatus: string | null;
                rescueProfileId: string | null;
                rescueClaimedUntil: Date | null;
                rescueAttempts: number;
                rescueTriedBy: string[];
                rescueRequestedAt: Date | null;
                rescueDoneAt: Date | null;
                rescueDetail: string | null;
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
            priority: number;
            ownerId: string | null;
            externalId: string | null;
            rawData: import("@prisma/client/runtime/library").JsonValue | null;
            url: string | null;
            profileId: string | null;
            imageUrl: string | null;
            delay: number;
            sourceType: import("@prisma/client").$Enums.SourceType;
            articleId: string | null;
            visualId: string | null;
            socialAngle: string | null;
            noComment: boolean;
            repeatTimes: number | null;
            repeatEveryHours: number | null;
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
    bulkRepeat(dto: BulkRepeatDto, acting: CurrentUser): Promise<{
        updated: number;
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
            facebookSuspension: string | null;
            suspendedAt: Date | null;
            suspensionDetail: string | null;
            modeBeforeSuspension: string | null;
            nstGroupId: string | null;
            nstGroupName: string | null;
            teamNstGroupId: string | null;
            teamNstGroupName: string | null;
            minimumAvailable: number | null;
            minimumAvailablePerGroup: number | null;
            isModerator: boolean;
            moderatorPaused: boolean;
            moderatorRunAt: Date | null;
            moderatorMembersRunAt: Date | null;
            moderatorBatch: number;
            moderatorEveryMinutes: number;
            moderatorMembers: boolean;
            moderatorPostsCheck: boolean;
            moderatorRemovals: boolean;
            moderatorSpam: boolean;
            moderatorPending: boolean;
            moderatorWindowStart: number;
            moderatorWindowEnd: number;
            moderatorTimezone: string;
            moderatorHourlyLimit: number;
            moderatorDailyLimit: number;
            moderatorSeenAt: Date | null;
            moderatorAgent: string | null;
            facebookUserId: string | null;
            facebookName: string | null;
            facebookSeenAt: Date | null;
            facebookProfileUrl: string | null;
        } | null;
        targets: ({
            group: {
                language: string | null;
                id: string;
                createdAt: Date;
                name: string;
                status: import("@prisma/client").$Enums.RecordStatus;
                updatedAt: Date;
                categoryId: string | null;
                priority: number;
                ownerId: string | null;
                externalId: string | null;
                url: string;
                spamCheckedAt: Date | null;
                spamClaimedUntil: Date | null;
                spamDetail: string | null;
                dailyCap: number | null;
                hoursStart: number | null;
                hoursEnd: number | null;
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
            approvalPendingSince: Date | null;
            approvalCheckedAt: Date | null;
            approvalChecks: number;
            approvalModClaimedUntil: Date | null;
            approvalModAttempts: number;
            attemptsCount: number;
            lastError: string | null;
            forcedAt: Date | null;
            verifyStatus: import("@prisma/client").$Enums.VerifyStatus | null;
            verifiedAt: Date | null;
            verifyDetail: string | null;
            verifyClaimedUntil: Date | null;
            verifyAttempts: number;
            republishCount: number;
            avoidProfileId: string | null;
            repeatRound: number;
            facebookUrl: string | null;
            rescueStatus: string | null;
            rescueProfileId: string | null;
            rescueClaimedUntil: Date | null;
            rescueAttempts: number;
            rescueTriedBy: string[];
            rescueRequestedAt: Date | null;
            rescueDoneAt: Date | null;
            rescueDetail: string | null;
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
        priority: number;
        ownerId: string | null;
        externalId: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        url: string | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        visualId: string | null;
        socialAngle: string | null;
        noComment: boolean;
        repeatTimes: number | null;
        repeatEveryHours: number | null;
    }>;
    update(id: string, dto: UpdatePostDto, acting: CurrentUser): Promise<{
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        priority: number;
        ownerId: string | null;
        externalId: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        url: string | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        visualId: string | null;
        socialAngle: string | null;
        noComment: boolean;
        repeatTimes: number | null;
        repeatEveryHours: number | null;
    }>;
    remove(id: string, acting: CurrentUser, force?: string): Promise<{
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        updatedAt: Date;
        description: string;
        title: string;
        priority: number;
        ownerId: string | null;
        externalId: string | null;
        rawData: import("@prisma/client/runtime/library").JsonValue | null;
        url: string | null;
        profileId: string | null;
        imageUrl: string | null;
        delay: number;
        sourceType: import("@prisma/client").$Enums.SourceType;
        articleId: string | null;
        visualId: string | null;
        socialAngle: string | null;
        noComment: boolean;
        repeatTimes: number | null;
        repeatEveryHours: number | null;
    }>;
}
