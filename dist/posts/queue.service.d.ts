import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { PriorityDto, QueueQueryDto } from './dto/queue.dto';
export declare class QueueService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    queue(query: QueueQueryDto, acting: CurrentUser | null): Promise<{
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
    private target;
    private locked;
    retry(targetId: string, acting: CurrentUser | null): Promise<{
        targetId: string;
        status: "AVAILABLE";
    }>;
    markPublished(targetId: string, acting: CurrentUser | null, rawUrl?: string): Promise<{
        targetId: string;
        status: "PUBLISHED";
    }>;
    private facebookUrl;
    setFacebookUrl(targetId: string, rawUrl: string, acting: CurrentUser | null): Promise<{
        targetId: string;
        facebookUrl: string;
    }>;
    history(targetId: string, acting: CurrentUser | null): Promise<{
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
    findByUrl(rawUrl: string, acting: CurrentUser | null): Promise<{
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
    removeTarget(targetId: string, acting: CurrentUser | null): Promise<{
        removed: boolean;
        postDeleted: boolean;
    }>;
    force(targetId: string, profileId: string | null, acting: CurrentUser | null): Promise<{
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
    setPriority(id: string, dto: PriorityDto, acting: CurrentUser | null): Promise<{
        id: string;
        priority: number;
    }>;
}
