import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../errors';
import type { UserStore } from '../store';
import type { Logger } from '../lib/logger';
import { silentLogger } from '../lib/logger';
import { createOidcVerifier, type OidcSettings, type OidcVerifier } from './oidc';
import { principalFromUser, type Principal } from './principal';

export type AuthMode = 'none' | 'token' | 'oidc';

/**
 * How this deployment decides who is calling.
 *
 * - `none` — no credential at all. The honest default for a laptop, and
 *   `/health` says `authRequired: false` so nobody mistakes it for one.
 * - `token` — one shared bearer key. What every script and the deploy smoke
 *   test already use; it authenticates a *caller*, never a person, so the audit
 *   trail keeps the display name the caller typed.
 * - `oidc` — a verified identity per request. Roles, ownership and the audit
 *   actor all come from the token from here on.
 */
export interface AuthSettings {
  mode: AuthMode;
  /** The shared key, read only in `token` mode. */
  apiKey: string;
  /** Present only in `oidc` mode. */
  oidc: OidcSettings | null;
  /** Subjects that are admins on first sight (`AEROSCRIBE_ADMIN_SUBS`). */
  adminSubs: string[];
}

export interface Authenticator {
  /**
   * Resolve the request's identity, or throw `401`/`503`.
   *
   * `null` is not a failure: it means this deployment has no notion of people,
   * which is what `none` and `token` mode are.
   */
  authenticate(request: Request): Promise<Principal | null>;
  /** What a client needs to start a login, or why there is none. */
  describe(): {
    mode: AuthMode;
    required: boolean;
    issuer: string | null;
    clientId: string | null;
    scopes: string[];
  };
  /** The verifier, so a test can reset its cache. Absent outside `oidc`. */
  oidc: OidcVerifier | null;
}

export function createAuthenticator({
  settings,
  users,
  logger = silentLogger(),
}: {
  settings: AuthSettings;
  users: UserStore;
  logger?: Logger;
}): Authenticator {
  const oidc = settings.oidc ? createOidcVerifier(settings.oidc) : null;

  return {
    oidc,

    describe: () => ({
      mode: settings.mode,
      required: settings.mode !== 'none',
      issuer: oidc ? oidc.describe().issuer : null,
      clientId: oidc ? oidc.describe().clientId : null,
      scopes: oidc ? oidc.describe().scopes : [],
    }),

    async authenticate(request: Request): Promise<Principal | null> {
      if (settings.mode === 'none') return null;

      const token = bearer(request.headers.get('authorization'));
      if (token === null) {
        throw new ApiError(401, 'unauthorized', 'A bearer token is required.', {
          mode: settings.mode,
        });
      }

      if (settings.mode === 'token') {
        if (settings.apiKey === '' || !secretsMatch(token, settings.apiKey)) {
          logger.warn('auth.rejected', { mode: 'token', reason: 'key mismatch' });
          throw new ApiError(401, 'unauthorized', 'A valid API key is required.');
        }
        // A shared key has no subject: the caller is a script, not a person.
        return null;
      }

      if (oidc === null) {
        // Unreachable through `loadConfig`, which refuses `oidc` without an
        // issuer. Failing closed beats trusting whatever arrives.
        throw new ApiError(503, 'auth_unavailable', 'AEROSCRIBE_AUTH=oidc is not configured.');
      }

      const identity = await oidc.verify(token);
      const admin = settings.adminSubs.includes(identity.sub);
      const user = await users.upsertOnLogin({
        sub: identity.sub,
        email: identity.email,
        name: identity.name,
        // An admin can be listed into existence by the deployment; everybody
        // else starts as a researcher and is promoted by an admin.
        role: admin ? 'admin' : 'researcher',
      });

      return principalFromUser(user);
    },
  };
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Compare a presented secret with the configured one.
 *
 * Hashing both before `timingSafeEqual` makes the comparison constant-time for
 * equal-length inputs *and* independent of length, so the time taken cannot be
 * used to learn how long the configured key is.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const left = createHash('sha256').update(presented, 'utf8').digest();
  const right = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(left, right);
}
