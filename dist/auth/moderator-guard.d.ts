import type { CurrentUser } from './current-user';
export declare const MODERATOR_LOCKED = "Profil mod\u00E9rateur : seul un administrateur de la plateforme peut le modifier (rubrique Mod\u00E9rateurs)";
export declare function assertMayManage(profile: {
    isModerator: boolean;
}, acting: CurrentUser | null | undefined): void;
export declare const isAdmin: (acting: CurrentUser | null | undefined) => boolean;
