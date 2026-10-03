export declare const keyHash: (key: string) => string;
export declare const PAIRING_STALE_HOURS = 24;
export type PairingState = 'never' | 'code_pending' | 'key_changed' | 'id_changed' | 'rejected' | 'unconfirmed' | 'stale' | 'confirmed';
export declare const BROKEN_PAIRINGS: PairingState[];
export type PairingHealth = {
    state: PairingState;
    detail: string;
    broken: boolean;
};
type RunnerPairing = {
    pairedAt: Date | null;
    pairCode: string | null;
    pairCodeExpiresAt: Date | null;
    pairedKeyHash: string | null;
    pairedExternalId: string | null;
    keyRejectedAt: Date | null;
    keyRejectReason: string | null;
    lastSeenAt: Date | null;
};
export declare function pairingHealth(runner: RunnerPairing | null, profile: {
    externalId: string | null;
}, currentKeyHash: string | null, now?: Date): PairingHealth;
export {};
