import type { AuthConfigResponse } from '@aeroscribe/contract';

/**
 * Authorization Code + PKCE, in the browser, with no dependency.
 *
 * The dashboard is a public client: it cannot keep a secret, so it must not be
 * given one. PKCE is what makes that safe — the code the IdP sends back is only
 * worth exchanging by the tab that holds the matching verifier, which never
 * leaves the browser and is never in the URL.
 *
 * Everything here is a pure function over an injected `fetch` and an injected
 * random source, because these are the two things a test must be able to pin:
 * a verifier that is not 32 random bytes is a verifier that can be guessed, and
 * a token request that does not carry the verifier is a token request any
 * intercepted code can be exchanged with.
 */

export interface AuthorizationServer {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface Tokens {
  accessToken: string;
  /** Absolute expiry, from `expires_in` or the token's own `exp`. */
  expiresAt: number;
  /** Present when the IdP returned one; not used for API calls. */
  refreshToken: string | null;
}

/** 32 bytes of entropy, base64url — RFC 7636 § 4.1's minimum is 43 characters. */
export function createVerifier(random: (size: number) => Uint8Array = defaultRandom): string {
  return base64url(random(32));
}

/** `BASE64URL(SHA256(verifier))`, the S256 challenge (RFC 7636 § 4.2). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

export function createState(random: (size: number) => Uint8Array = defaultRandom): string {
  return base64url(random(16));
}

/**
 * The URL the browser navigates to.
 *
 * `prompt=login` is deliberately absent: a person with a live IdP session
 * should not be asked for a password again because a tab was refreshed. The
 * `state` is what protects the *callback*, not the login.
 */
export function authorizeUrl(input: {
  config: Pick<AuthConfigResponse, 'clientId' | 'scopes'>;
  server: Pick<AuthorizationServer, 'authorizationEndpoint'>;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(input.server.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.config.clientId ?? '');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.config.scopes.join(' '));
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export type CallbackResult =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'code'; code: string; state: string };

/** What the IdP sent back, read off `window.location.search`. */
export function readCallback(search: string): CallbackResult {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error) {
    const description = params.get('error_description') ?? '';
    return { kind: 'error', message: description === '' ? error : `${error}: ${description}` };
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return { kind: 'none' };
  return { kind: 'code', code, state };
}

/**
 * Fetch the issuer's discovery document.
 *
 * The `issuer` in the document must equal the one configured, for the same
 * reason the API checks it: a document that names a different issuer is a
 * document that can point this client at someone else's token endpoint.
 */
export async function discover(
  issuer: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AuthorizationServer> {
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`The issuer's discovery document answered ${response.status}.`);

  // The document is snake_case by specification; this file is camelCase by
  // convention. The translation happens once, here, and nowhere else.
  const document = (await response.json()) as {
    issuer?: unknown;
    authorization_endpoint?: unknown;
    token_endpoint?: unknown;
    jwks_uri?: unknown;
  };
  if (document.issuer !== issuer) {
    throw new Error(
      `The discovery document names issuer "${String(document.issuer)}", not "${issuer}".`,
    );
  }
  const required = {
    authorizationEndpoint: document.authorization_endpoint,
    tokenEndpoint: document.token_endpoint,
    jwksUri: document.jwks_uri,
  } as const;
  for (const [key, value] of Object.entries(required)) {
    if (typeof value !== 'string' || value === '') {
      throw new Error(`The discovery document has no ${key}.`);
    }
  }
  return {
    issuer,
    authorizationEndpoint: required.authorizationEndpoint as string,
    tokenEndpoint: required.tokenEndpoint as string,
    jwksUri: required.jwksUri as string,
  };
}

/**
 * Exchange the code for tokens.
 *
 * `client_secret` is absent on purpose: this client has none, and sending an
 * empty one makes some IdPs reject the request. The verifier is what proves the
 * code belongs to this tab.
 */
export async function exchangeCode(input: {
  server: Pick<AuthorizationServer, 'tokenEndpoint'>;
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<Tokens> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.verifier,
  });

  const response = await fetchImpl(input.server.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  } | null;

  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
    const detail =
      typeof payload?.error_description === 'string' ? `: ${payload.error_description}` : '';
    throw new Error(`The token endpoint refused the code (${code})${detail}.`);
  }
  if (typeof payload?.access_token !== 'string' || payload.access_token === '') {
    throw new Error('The token endpoint answered without an access token.');
  }

  return {
    accessToken: payload.access_token,
    expiresAt: expiryOf(payload, input.now ?? Date.now()),
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
  };
}

/**
 * When this token stops being good, in milliseconds.
 *
 * `expires_in` wins because it is the server's own statement; the token's `exp`
 * is the fallback for an IdP that sends only the JWT. A token with neither is
 * treated as short-lived rather than eternal: guessing "forever" means holding a
 * dead token until the next 401.
 */
export function expiryOf(
  payload: { expires_in?: unknown; access_token?: unknown },
  now: number,
): number {
  if (typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)) {
    return now + payload.expires_in * 1000;
  }
  const claims = typeof payload.access_token === 'string' ? claimsOf(payload.access_token) : null;
  if (claims && typeof claims.exp === 'number') return claims.exp * 1000;
  return now + 60_000;
}

/** The payload of a JWT, without verifying it — for `exp` only, never for trust. */
export function claimsOf(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function defaultRandom(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
