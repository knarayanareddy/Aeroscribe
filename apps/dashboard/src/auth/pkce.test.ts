import { describe, expect, it, vi } from 'vitest';
import type { AuthConfigResponse } from '@aeroscribe/contract';
import {
  authorizeUrl,
  challengeFor,
  claimsOf,
  createState,
  createVerifier,
  discover,
  exchangeCode,
  expiryOf,
  readCallback,
} from './pkce';
import { createAuthSession, type Storage } from './session';

/**
 * The login flow, tested where it can actually be wrong.
 *
 * No IdP is reachable from this sandbox, so the connector is exercised against
 * an injected `fetch` that asserts what the browser would have sent. That is the
 * same reason the API's tests use a real issuer over loopback: what matters is
 * the bytes on the wire, not that a mock was called.
 */

const config: Pick<AuthConfigResponse, 'mode' | 'issuer' | 'clientId' | 'scopes'> = {
  mode: 'oidc',
  issuer: 'https://idp.example',
  clientId: 'aeroscribe-dashboard',
  scopes: ['openid', 'profile', 'email'],
};

const discovery = {
  issuer: 'https://idp.example',
  authorization_endpoint: 'https://idp.example/authorize',
  token_endpoint: 'https://idp.example/token',
  jwks_uri: 'https://idp.example/jwks',
};

/** A `sessionStorage` stand-in, so nothing between tests is shared. */
function memoryStorage(): Storage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/** `fetch` that answers discovery and a token exchange, recording the request. */
function fakeIdp(
  tokenResponse: Record<string, unknown> = { access_token: 'at-1', expires_in: 300 },
  status = 200,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(JSON.stringify(discovery), { status: 200 });
    }
    if (url === discovery.token_endpoint) {
      return new Response(JSON.stringify(tokenResponse), { status });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('PKCE', () => {
  it('makes a 43-character verifier with no padding and no illegal characters', () => {
    const verifier = createVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createVerifier()).not.toBe(verifier);
  });

  it('derives the S256 challenge from the verifier (known vector)', async () => {
    // RFC 7636 Appendix B's worked example.
    await expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes a state that is not the verifier', () => {
    expect(createState()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('builds an authorize URL a public client may use', async () => {
    const verifier = createVerifier();
    const url = new URL(
      authorizeUrl({
        config,
        server: { authorizationEndpoint: discovery.authorization_endpoint },
        redirectUri: 'https://app.example/',
        state: 'state-1',
        challenge: await challengeFor(verifier),
      }),
    );

    expect(url.origin + url.pathname).toBe('https://idp.example/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('aeroscribe-dashboard');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // The verifier must never be in the URL: that is the whole point of PKCE.
    expect(url.toString()).not.toContain(verifier);
    // No secret: a public client has none, and an empty one is a lie some IdPs
    // reject outright.
    expect(url.searchParams.get('client_secret')).toBeNull();
  });

  it('refuses a discovery document that names another issuer', async () => {
    const { fetchImpl } = fakeIdp();
    const liar = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...discovery, issuer: 'https://evil.example' }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    await expect(discover('https://idp.example', fetchImpl)).resolves.toEqual({
      issuer: 'https://idp.example',
      authorizationEndpoint: discovery.authorization_endpoint,
      tokenEndpoint: discovery.token_endpoint,
      jwksUri: discovery.jwks_uri,
    });
    await expect(discover('https://idp.example', liar)).rejects.toThrow(/evil\.example/);
  });

  it('refuses a discovery document with no token endpoint', async () => {
    const partial = vi.fn(
      async () =>
        new Response(JSON.stringify({ issuer: 'https://idp.example', jwks_uri: 'x' }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    // The first missing piece is named; which one it is matters less than the
    // fact that a half-described issuer is not usable.
    await expect(discover('https://idp.example', partial)).rejects.toThrow(/has no /);
  });

  it('exchanges the code with the verifier and no client secret', async () => {
    const { fetchImpl, calls } = fakeIdp();
    const tokens = await exchangeCode({
      server: { tokenEndpoint: discovery.token_endpoint },
      clientId: 'aeroscribe-dashboard',
      code: 'code-1',
      verifier: 'verifier-1',
      redirectUri: 'https://app.example/',
      fetchImpl,
      now: 1_000,
    });

    expect(tokens).toEqual({ accessToken: 'at-1', expiresAt: 301_000, refreshToken: null });

    const sent = new URLSearchParams(String(calls.at(-1)!.init!.body));
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('code')).toBe('code-1');
    expect(sent.get('code_verifier')).toBe('verifier-1');
    expect(sent.get('client_id')).toBe('aeroscribe-dashboard');
    expect(sent.get('redirect_uri')).toBe('https://app.example/');
    expect(sent.get('client_secret')).toBeNull();
    expect(new Headers(calls.at(-1)!.init!.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('reports what the token endpoint said when it refuses', async () => {
    const { fetchImpl } = fakeIdp(
      { error: 'invalid_grant', error_description: 'code expired' },
      400,
    );
    await expect(
      exchangeCode({
        server: { tokenEndpoint: discovery.token_endpoint },
        clientId: 'c',
        code: 'c',
        verifier: 'v',
        redirectUri: 'https://app.example/',
        fetchImpl,
      }),
    ).rejects.toThrow(/invalid_grant\): code expired/);
  });

  it('refuses a token response with no access token', async () => {
    const { fetchImpl } = fakeIdp({ expires_in: 60 }, 200);
    await expect(
      exchangeCode({
        server: { tokenEndpoint: discovery.token_endpoint },
        clientId: 'c',
        code: 'c',
        verifier: 'v',
        redirectUri: 'https://app.example/',
        fetchImpl,
      }),
    ).rejects.toThrow(/without an access token/);
  });

  it('reads exp out of an opaque-looking token only as a fallback', () => {
    const header = btoa(JSON.stringify({ alg: 'RS256' })).replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ exp: 2_000 })).replace(/=+$/, '');
    const jwt = `${header}.${payload}.signature`;

    expect(claimsOf(jwt)).toEqual({ exp: 2_000 });
    expect(claimsOf('not-a-jwt')).toBeNull();
    // `expires_in` is the server's own statement and wins over the claim.
    expect(expiryOf({ expires_in: 10, access_token: jwt }, 0)).toBe(10_000);
    expect(expiryOf({ access_token: jwt }, 0)).toBe(2_000_000);
    // Neither: a short life, not an eternal one.
    expect(expiryOf({ access_token: 'opaque' }, 0)).toBe(60_000);
  });

  it('separates the callback cases an IdP can produce', () => {
    expect(readCallback('')).toEqual({ kind: 'none' });
    expect(readCallback('?code=c&state=s')).toEqual({ kind: 'code', code: 'c', state: 's' });
    expect(readCallback('?error=access_denied')).toEqual({
      kind: 'error',
      message: 'access_denied',
    });
    expect(readCallback('?error=access_denied&error_description=Nope')).toEqual({
      kind: 'error',
      message: 'access_denied: Nope',
    });
    // A code with no state cannot be checked, so it is not a login.
    expect(readCallback('?code=c')).toEqual({ kind: 'none' });
  });
});

describe('the session', () => {
  it('needs no login when the deployment has none', async () => {
    const session = createAuthSession({
      config: { mode: 'token', issuer: null, clientId: null, scopes: [] },
      storage: memoryStorage(),
    });
    expect(session.requiresLogin).toBe(false);
    expect(session.token()).toBeNull();
    await expect(session.start()).rejects.toThrow(/no login/i);
  });

  it('stores the token after the callback and hands it to the client', async () => {
    const storage = memoryStorage();
    const { fetchImpl } = fakeIdp();
    const navigate = vi.fn();
    const session = createAuthSession({
      config,
      storage,
      fetchImpl,
      navigate,
      redirectUri: 'https://app.example/',
      now: () => 1_000,
    });

    const url = new URL(await session.start());
    expect(navigate).toHaveBeenCalledWith(url.toString());
    const state = url.searchParams.get('state')!;
    // The verifier went to storage, not to the URL.
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await session.complete(`?code=code-1&state=${state}`);
    expect(session.token()).toBe('at-1');
    // The pending login is consumed: a second callback with the same state is a
    // replay, and is refused.
    await expect(session.complete(`?code=code-2&state=${state}`)).rejects.toThrow(
      /no pending request/i,
    );
  });

  it('refuses a callback whose state does not match', async () => {
    const storage = memoryStorage();
    const session = createAuthSession({
      config,
      storage,
      fetchImpl: fakeIdp().fetchImpl,
      redirectUri: 'https://app.example/',
    });

    const url = new URL(await session.start());
    expect(url.searchParams.get('state')).not.toBe('someone-elses-state');

    await expect(session.complete('?code=code-1&state=someone-elses-state')).rejects.toThrow(
      /did not match/i,
    );
    expect(session.token()).toBeNull();
    // The verifier is gone too: a failed login must not leave one behind.
    expect(Object.keys(storage.dump())).not.toContain('aeroscribe.pkce');
  });

  it('surfaces an IdP error instead of a blank screen', async () => {
    const session = createAuthSession({
      config,
      storage: memoryStorage(),
      fetchImpl: fakeIdp().fetchImpl,
      redirectUri: 'https://app.example/',
    });
    await expect(
      session.complete('?error=access_denied&error_description=User%20said%20no'),
    ).rejects.toThrow(/access_denied: User said no/);
  });

  it('treats a token that is about to expire as expired', async () => {
    let now = 1_000;
    const storage = memoryStorage();
    const session = createAuthSession({
      config,
      storage,
      fetchImpl: fakeIdp().fetchImpl,
      redirectUri: 'https://app.example/',
      now: () => now,
    });

    const url = new URL(await session.start());
    await session.complete(`?code=code-1&state=${url.searchParams.get('state')}`);
    expect(session.token()).toBe('at-1');

    // `expires_in: 300` from `now`, minus the 30 s margin.
    now = 1_000 + 271_000;
    expect(session.token()).toBeNull();
    expect(session.current()).toBeNull();
  });

  it('forgets everything on clear', async () => {
    const storage = memoryStorage();
    const session = createAuthSession({
      config,
      storage,
      fetchImpl: fakeIdp().fetchImpl,
      redirectUri: 'https://app.example/',
      now: () => 1_000,
    });
    const url = new URL(await session.start());
    await session.complete(`?code=code-1&state=${url.searchParams.get('state')}`);

    session.clear();
    expect(session.token()).toBeNull();
    expect(storage.dump()).toEqual({});
  });

  it('starts over when the stored session is unreadable', () => {
    const storage = memoryStorage();
    storage.setItem('aeroscribe.session', '{not json');
    const session = createAuthSession({ config, storage, redirectUri: 'https://app.example/' });

    expect(session.current()).toBeNull();
    expect(storage.dump()).toEqual({});
  });

  it('refuses a session stored under a different issuer', () => {
    // A token from another deployment is not a token for this one; the shape
    // check is the cheap part, and the API is the authority on the rest.
    const storage = memoryStorage();
    storage.setItem(
      'aeroscribe.session',
      JSON.stringify({ accessToken: 'at-old', expiresAt: Date.now() + 600_000, issuer: 'x' }),
    );
    const session = createAuthSession({ config, storage, redirectUri: 'https://app.example/' });
    expect(session.current()).toMatchObject({ accessToken: 'at-old', issuer: 'x' });
  });
});
