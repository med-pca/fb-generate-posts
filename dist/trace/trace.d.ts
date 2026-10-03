import { Prisma } from '@prisma/client';
export declare const TRACE_KINDS: {
    readonly PUBLISHED: "Publié";
    readonly URL_MISSING: "Publié sans adresse Facebook";
    readonly COMMENTED: "Commentaire posé";
    readonly LINK_PLACED: "Lien de l’article posé";
    readonly FAILED: "Échec de publication";
    readonly RETRIED: "Relancé";
    readonly MARKED_PUBLISHED: "Marqué publié à la main";
    readonly URL_SET: "Adresse Facebook enregistrée";
    readonly URL_FOUND: "Adresse retrouvée par le vérificateur";
    readonly VERIFIED_OK: "Vérifié : en ligne avec son lien";
    readonly VERIFY_PENDING: "Vérifié : en attente de validation";
    readonly VERIFY_UNREACHABLE: "Vérification impossible";
    readonly VERIFY_MISSING_POST: "Vérifié : introuvable";
    readonly VERIFY_MISSING_LINK: "Vérifié : en ligne sans son lien";
    readonly DELETED: "Supprimé par le vérificateur";
    readonly DELETE_FAILED: "Suppression impossible";
    readonly REQUEUED: "Remis dans la file";
    readonly NEEDS_ACTION: "À traiter";
    readonly RESOLVED_OK: "Validé à la main";
};
export type TraceKind = keyof typeof TRACE_KINDS;
export type TraceInput = {
    postTargetId: string;
    kind: TraceKind;
    facebookUrl?: string | null;
    actor?: string | null;
    profileId?: string | null;
    jobId?: string | null;
    detail?: string | null;
};
type Client = {
    publicationTrace: Prisma.TransactionClient['publicationTrace'];
};
export declare function trace(client: Client, input: TraceInput): Prisma.Prisma__PublicationTraceClient<{
    id: string;
    createdAt: Date;
    profileId: string | null;
    facebookUrl: string | null;
    postTargetId: string;
    jobId: string | null;
    kind: string;
    actor: string | null;
    detail: string | null;
}, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
export declare function normalizeFacebookUrl(raw: string | null | undefined): string | null;
export {};
