import { createHash } from 'node:crypto';

/** Empreinte d'une clé : de quoi comparer sans stocker la clé une seconde
 * fois. */
export const keyHash = (key: string) =>
  createHash('sha256').update(key).digest('hex');

/** Au-delà, un appairage confirmé redevient « à confirmer » : rien ne dit
 * qu'il est cassé, seulement qu'on ne l'a pas vu marcher récemment. */
export const PAIRING_STALE_HOURS = 24;

export type PairingState =
  | 'never' // jamais appairé
  | 'code_pending' // code émis, pas encore échangé
  | 'key_changed' // la clé du compte n'est plus celle du navigateur
  | 'id_changed' // l'identifiant NSTBrowser a changé depuis l'appairage
  | 'rejected' // le navigateur bat, mais sa clé est refusée
  | 'unconfirmed' // appairé, aucun battement depuis
  | 'stale' // confirmé, mais plus vu depuis longtemps
  | 'confirmed'; // un battement récent le prouve

/** Ce qui oblige à refaire l'appairage : le navigateur ne sera plus reconnu. */
export const BROKEN_PAIRINGS: PairingState[] = ['key_changed', 'id_changed', 'rejected'];

export type PairingHealth = {
  state: PairingState;
  /** Une phrase qui dit quoi faire. */
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

/** L'état RÉEL d'un appairage, et non le simple fait qu'un code ait été
 * échangé un jour.
 *
 * L'API ne peut pas interroger un navigateur ; elle juge sur ce qu'elle
 * sait : la clé qu'il détient (remise à l'appairage, relue à chaque
 * battement) comparée à la clé actuelle du compte, l'identifiant sous lequel
 * il se présente, ses battements refusés, et ses battements réussis.
 *
 * L'ordre compte : ce qui est certainement cassé passe avant ce qui n'est
 * que pas encore vu. */
export function pairingHealth(
  runner: RunnerPairing | null,
  profile: { externalId: string | null },
  currentKeyHash: string | null,
  now = new Date(),
): PairingHealth {
  const ok = (state: PairingState, detail: string): PairingHealth => ({
    state,
    detail,
    broken: BROKEN_PAIRINGS.includes(state),
  });
  const codePending =
    Boolean(runner?.pairCode) &&
    (runner?.pairCodeExpiresAt?.getTime() ?? 0) > now.getTime();

  if (!runner?.pairedAt) {
    return codePending
      ? ok('code_pending', 'Code émis : à coller dans l’extension du navigateur')
      : ok('never', 'Jamais appairé');
  }
  if (runner.pairedExternalId && runner.pairedExternalId !== profile.externalId) {
    return ok(
      'id_changed',
      `L’identifiant NSTBrowser a changé depuis l’appairage (${runner.pairedExternalId} → ${profile.externalId ?? 'aucun'}) : ré-appairer`,
    );
  }
  if (runner.pairedKeyHash && currentKeyHash && runner.pairedKeyHash !== currentKeyHash) {
    return ok(
      'key_changed',
      'La clé du compte a changé depuis l’appairage (clé régénérée, ou profil passé à un autre compte) : ré-appairer',
    );
  }
  // Refusé APRÈS le dernier battement réussi : c'est l'état présent.
  if (
    runner.keyRejectedAt &&
    (!runner.lastSeenAt || runner.keyRejectedAt > runner.lastSeenAt)
  ) {
    return ok(
      'rejected',
      `Le navigateur bat, mais il est refusé : ${runner.keyRejectReason ?? 'clé invalide'} — ré-appairer`,
    );
  }
  const seenSincePairing =
    runner.lastSeenAt && runner.lastSeenAt.getTime() >= runner.pairedAt.getTime();
  if (!seenSincePairing) {
    return ok(
      'unconfirmed',
      'Appairé, mais aucun battement depuis : ouvrez le navigateur pour le confirmer',
    );
  }
  const hours = (now.getTime() - runner.lastSeenAt!.getTime()) / 3_600_000;
  if (hours > PAIRING_STALE_HOURS) {
    return ok(
      'stale',
      `Pas vu depuis ${Math.round(hours / 24) || 1} j : ouvrez le navigateur pour le confirmer`,
    );
  }
  return ok('confirmed', 'Confirmé par un battement récent');
}
