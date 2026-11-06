import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { RescueService } from '../jobs/rescue.service';
import { PriorityDto, QueueQueryDto } from './dto/queue.dto';
export declare class QueueService {
    private readonly prisma;
    private readonly rescue?;
    constructor(prisma: PrismaService, rescue?: RescueService | undefined);
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
    private attachableWhere;
    attachUrl(rawUrl: string, targetId: string | undefined, acting: CurrentUser | null): Promise<{
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
    private attach;
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
