import type { AuthConfigResponse } from '@aeroscribe/contract';
import {
  authorizeUrl,
  challengeFor,
  createState,
  createVerifier,
  discover,
  expiryOf,
  exchangeCode,
  readCallback,
  type AuthorizationServer,
  type Tokens,
} from './pkce';

/**
 * The login, as a state machine the app can drive.
 *
 * In `oidc` mode the browser holds the only credential: an access token in
 * `sessionStorage`, so "log in" survives a reload but not a shared laptop. The
 * verifier and the state live there too, under a key that is removed the moment
 * the callback is handled — a PKCE verifier left behind is a code that can be
 * exchanged by the next person to use the browser.
 *
 * `expiresAt` is tracked in milliseconds and checked with a margin, because a
 * token that expires during a request is indistinguishable from a wrong one to
 * the user, and a 401 a second later is a worse experience than a refresh now.
 */

export interface StoredSession {
  accessToken: string;
  expiresAt: number;
  issuer: string;
}

const SESSION_KEY = 'aeroscribe.session';
const PENDING_KEY = 'aeroscribe.pkce';
/** Treat a token as spent this long before it really is. */
const EXPIRY_MARGIN_MS = 30_000;

interface PendingLogin {
  verifier: string;
  state: string;
  redirectUri: string;
  issuer: string;
}

export type Storage = Pick<typeof globalThis.sessionStorage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AuthSessionOptions {
  /** `/api/v1/auth/config`'s answer; `mode: 'none' | 'token'` means no login. */
  config: Pick<AuthConfigResponse, 'mode' | 'issuer' | 'clientId' | 'scopes'>;
  /** Where the IdP sends the browser back to. Defaults to the current origin. */
  redirectUri?: string;
  storage?: Storage;
  fetchImpl?: typeof fetch;
  /** `window.location.assign` in the app; recorded in tests. */
  navigate?: (url: string) => void;
  now?: () => number;
}

export interface AuthSession {
  /** The token to send, or `null` when there is none (or it has expired). */
  token(): string | null;
  /** The session, when one is stored and still valid. */
  current(): StoredSession | null;
  /** Send the browser to the IdP. Resolves with the URL it would navigate to. */
  start(): Promise<string>;
  /** Handle `?code=…&state=…` on load. Throws on a state mismatch. */
  complete(search?: string): Promise<StoredSession | null>;
  /** Forget the token and the pending login. */
  clear(): void;
  /** Whether this deployment needs a login at all. */
  readonly requiresLogin: boolean;
}

export function createAuthSession(options: AuthSessionOptions): AuthSession {
  const storage = options.storage ?? globalThis.sessionStorage;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const requiresLogin = options.config.mode === 'oidc';
  const redirectUri = options.redirectUri ?? defaultRedirectUri();
  let server: Promise<AuthorizationServer> | null = null;

  function discovery(): Promise<AuthorizationServer> {
    if (!requiresLogin) return Promise.reject(new Error('This deployment has no login.'));
    if (options.config.issuer === null) return Promise.reject(new Error('No issuer configured.'));
    server ??= discover(options.config.issuer, fetchImpl);
    return server;
  }

  function read<K>(key: string): K | null {
    try {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as K) : null;
    } catch {
      // A session written by an older version, or by hand. Starting over is the
      // only safe reading: a half-parsed token is not a token.
      storage.removeItem(key);
      return null;
    }
  }

  const session: AuthSession = {
    requiresLogin,

    current(): StoredSession | null {
      const stored = read<StoredSession>(SESSION_KEY);
      if (!stored || typeof stored.accessToken !== 'string') return null;
      if (stored.expiresAt - EXPIRY_MARGIN_MS <= now()) return null;
      return stored;
    },

    token(): string | null {
      return session.current()?.accessToken ?? null;
    },

    async start(): Promise<string> {
      const authorizationServer = await discovery();
      const verifier = createVerifier();
      const state = createState();
      const pending: PendingLogin = {
        verifier,
        state,
        redirectUri,
        issuer: options.config.issuer!,
      };
      storage.setItem(PENDING_KEY, JSON.stringify(pending));

      const url = authorizeUrl({
        config: options.config,
        server: authorizationServer,
        redirectUri,
        state,
        challenge: await challengeFor(verifier),
      });
      options.navigate?.(url);
      return url;
    },

    async complete(search = currentSearch()): Promise<StoredSession | null> {
      const callback = readCallback(search);
      if (callback.kind === 'none') return null;
      if (callback.kind === 'error') {
        clearPending(storage);
        throw new Error(`The identity provider refused the login (${callback.message}).`);
      }

      const pending = read<PendingLogin>(PENDING_KEY);
      // Consumed whether or not it matches: a state that failed once must not be
      // usable on a second attempt.
      clearPending(storage);
      if (!pending) {
        throw new Error(
          'The login callback arrived with no pending request. Start the login again.',
        );
      }
      // A mismatch is a forged callback (or a stale tab). Exchanging the code
      // anyway would hand an attacker's code to this client's verifier.
      if (callback.state !== pending.state) {
        throw new Error('The login callback did not match the request it claims to answer.');
      }

      const authorizationServer = await discovery();
      const tokens: Tokens = await exchangeCode({
        server: authorizationServer,
        clientId: options.config.clientId ?? '',
        code: callback.code,
        verifier: pending.verifier,
        redirectUri: pending.redirectUri,
        fetchImpl,
        now: now(),
      });

      const stored: StoredSession = {
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
        issuer: authorizationServer.issuer,
      };
      storage.setItem(SESSION_KEY, JSON.stringify(stored));
      return stored;
    },

    clear(): void {
      clearPending(storage);
      storage.removeItem(SESSION_KEY);
    },
  };

  return session;
}

/** Absolute expiry for a token the app already has, for tests and refresh logic. */
export function expiresAtOf(
  payload: { expires_in?: unknown; access_token?: unknown },
  now: number,
) {
  return expiryOf(payload, now);
}

function clearPending(storage: Storage): void {
  storage.removeItem(PENDING_KEY);
}

function currentSearch(): string {
  return typeof globalThis.location === 'undefined' ? '' : globalThis.location.search;
}

/**
 * The redirect URI is the page that started the login, without the query.
 *
 * An IdP matches it against a registered value exactly, so it has to be stable:
 * the origin plus the app's base path, never the URL with `?code=` on it.
 */
function defaultRedirectUri(): string {
  if (typeof globalThis.location === 'undefined') return 'http://localhost/';
  const { origin, pathname } = globalThis.location;
  return `${origin}${pathname}`;
}
