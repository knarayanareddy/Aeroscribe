import type { MeResponse } from '@aeroscribe/contract';

/**
 * What the UI may offer this principal.
 *
 * This mirrors `services/api/src/auth/policy.ts` and is **not** the authority:
 * the server decides, and a decision that disagrees with this file shows up as a
 * `403` carrying the server's own sentence. The point of the mirror is that a
 * reviewer is not offered a button that cannot work, and a researcher is not
 * shown an approve action on somebody else's run.
 *
 * `null` — fixture mode, `none` mode, `token` mode — means "no roles in play",
 * which is exactly when every control stays available.
 */
export type Principal = NonNullable<MeResponse['principal']>;

function ownsOrIsDecider(principal: Principal, ownerSub: string | null | undefined): boolean {
  if (principal.role === 'admin') return true;
  if (principal.role === 'reviewer') return true;
  return ownerSub !== undefined && ownerSub === principal.sub;
}

/** May this principal run the next stage of this run? */
export function canAdvance(principal: Principal | null, ownerSub?: string | null): boolean {
  if (principal === null) return true;
  // Reviewers judge; they do not produce. Even their own runs.
  if (principal.role === 'reviewer') return false;
  return ownsOrIsDecider(principal, ownerSub);
}

/** May this principal approve or reject the open gate? */
export function canDecideGate(principal: Principal | null, ownerSub?: string | null): boolean {
  if (principal === null) return true;
  return ownsOrIsDecider(principal, ownerSub);
}

/** Why a control is unavailable, in the words the server would use. */
export function whyNot(principal: Principal | null, action: 'advance' | 'gate'): string {
  if (principal === null) return 'This action is not available.';
  if (action === 'advance') {
    return principal.role === 'reviewer'
      ? 'A reviewer judges runs and does not run stages.'
      : 'This run belongs to another account.';
  }
  return 'Only the owner of this run, a reviewer or an admin can decide a gate.';
}
