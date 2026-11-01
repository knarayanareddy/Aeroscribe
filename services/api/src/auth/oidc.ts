import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { ApiError } from '../errors';

/**
 * OIDC token validation.
 *
 * The API never issues tokens and never sees a password: it fetches the
 * issuer's discovery document once, uses the `jwks_uri` it advertises, and
 * verifies the bearer token against the keys published there. `jose` does the
 * cryptography and the key cache because JWT verification is the one part of
 * this codebase where a subtle mistake is a total compromise.
 *
 * Two decisions worth naming:
 *
 * - **Asymmetric algorithms only.** `HS*` would let anyone who can read the
 *   JWKS mint tokens, and `none` is not an algorithm. The list is explicit
 *   rather than "whatever the key allows".
 * - **A broken IdP is `503`, not `401`.** An unreachable issuer means the API
 *   cannot decide whether a token is good; answering `401` would log every user
 *   out during an IdP outage and hide the real fault.
 */

export interface OidcSettings {
  /** The `iss` every token must carry, and the base of the discovery URL. */
  issuer: string;
  /** The `aud` every token must carry: the API's own client id. */
  audience: string;
  /** The client the *dashboard* uses. Public by nature, served to the browser. */
  clientId: string;
  /** Scopes the dashboard asks for. */
  scopes: string[];
  /** Tolerated clock difference between the IdP and this process, in seconds. */
  clockSkewSeconds: number;
}

export interface VerifiedIdentity {
  sub: string;
  email: string | null;
  name: string | null;
}

export interface OidcVerifier {
  /** Resolve a bearer token to an identity, or throw `ApiError`. */
  verify(token: string): Promise<VerifiedIdentity>;
  /** What the dashboard needs to start a login. */
  describe(): { issuer: string; clientId: string; scopes: string[] };
  /**
   * Forget the cached discovery document. Exposed for tests and for an operator
   * who needs to pick up a rotated issuer without a restart; nothing calls it
   * in the request path.
   */
  reset(): void;
}

interface DiscoveryDocument {
  issuer: string;
  jwks_uri: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
}

const ALLOWED_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
];

export function createOidcVerifier(settings: OidcSettings): OidcVerifier {
  let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  async function discover(): Promise<DiscoveryDocument> {
    const url = `${settings.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (error) {
      throw unavailable(
        settings.issuer,
        `the discovery document could not be fetched: ${message(error)}`,
      );
    }
    if (!response.ok) {
      throw unavailable(settings.issuer, `the discovery document answered ${response.status}`);
    }

    let document: DiscoveryDocument;
    try {
      document = (await response.json()) as DiscoveryDocument;
    } catch {
      throw unavailable(settings.issuer, 'the discovery document is not JSON');
    }
    if (typeof document.issuer !== 'string' || typeof document.jwks_uri !== 'string') {
      throw unavailable(settings.issuer, 'the discovery document has no issuer or jwks_uri');
    }
    // OpenID Connect Discovery § 4.3: the issuer in the document must match the
    // one used to fetch it, or an attacker who controls a redirect target can
    // make the API trust a different key set than the one the operator named.
    if (document.issuer !== settings.issuer) {
      throw unavailable(
        settings.issuer,
        `the discovery document names issuer "${document.issuer}"`,
      );
    }
    return document;
  }

  async function keySet(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (jwks === null) {
      const document = await discover();
      // `createRemoteJWKSet` caches keys, refetches an unknown `kid` at most
      // once per cooldown, and keeps a rotated key set from stampeding.
      jwks = createRemoteJWKSet(new URL(document.jwks_uri), {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      });
    }
    return jwks;
  }

  return {
    describe: () => ({
      issuer: settings.issuer,
      clientId: settings.clientId,
      scopes: [...settings.scopes],
    }),

    reset: () => {
      jwks = null;
    },

    async verify(token: string): Promise<VerifiedIdentity> {
      const keys = await keySet();

      let payload: JWTPayload;
      try {
        const result = await jwtVerify(token, keys, {
          issuer: settings.issuer,
          audience: settings.audience,
          clockTolerance: settings.clockSkewSeconds,
          algorithms: ALLOWED_ALGORITHMS,
          // A token with no `exp` is not a token this API accepts: an unexpiring
          // credential is the one that ends up in a log.
          requiredClaims: ['exp', 'sub', 'iss', 'aud'],
        });
        payload = result.payload;
      } catch (error) {
        throw refused(error, settings.issuer);
      }

      // `requiredClaims` above guarantees `sub`; the type does not know that.
      const sub = payload.sub;
      if (typeof sub !== 'string' || sub.trim() === '') {
        throw new ApiError(401, 'unauthorized', 'The access token has no subject.');
      }

      return {
        sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        name:
          typeof payload.name === 'string'
            ? payload.name
            : typeof payload.preferred_username === 'string'
              ? payload.preferred_username
              : null,
      };
    },
  };
}

/** A token this API will not accept: the caller's problem, and a `401`. */
function refused(error: unknown, issuer: string): ApiError {
  const code = (error as { code?: string }).code ?? '';

  // The issuer or its keys could not be read. Retrying later may work and a new
  // login will not, so this must not look like a bad token. A failed `fetch`
  // arrives as a plain `TypeError`, not a `JOSEError`, which is exactly why the
  // test is "did `jose` reject the token", not "which code came back".
  const keySetProblem =
    code === joseErrors.JWKSTimeout.code ||
    code === joseErrors.JWKSMultipleMatchingKeys.code ||
    code === joseErrors.JWKSInvalid.code ||
    // The base class: `jose` raises it for "Expected 200 OK from the JSON Web Key
    // Set HTTP response", which is the issuer's fault and nobody else's.
    code === joseErrors.JOSEError.code;
  if (keySetProblem || !(error instanceof joseErrors.JOSEError)) {
    return unavailable(issuer, `the key set could not be read (${code || 'network'})`);
  }

  const reason =
    code === joseErrors.JWTExpired.code
      ? 'the token has expired'
      : code === joseErrors.JWTClaimValidationFailed.code
        ? `a required claim is wrong (${(error as { claim?: string }).claim ?? 'unknown'})`
        : code === joseErrors.JWSSignatureVerificationFailed.code
          ? 'the signature does not verify against the issuer’s keys'
          : code === joseErrors.JOSEAlgNotAllowed.code
            ? 'the algorithm is not accepted'
            : 'the token is not valid';

  return new ApiError(401, 'unauthorized', `The access token was refused: ${reason}.`);
}

function unavailable(issuer: string, detail: string): ApiError {
  return new ApiError(
    503,
    'auth_unavailable',
    `The identity provider at ${issuer} could not be used: ${detail}. This is not a rejected token; retry once it is reachable.`,
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
