// @vitest-environment node
import { exportSPKI, importJWK, SignJWT, type JWK } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { createOidcVerifier, type OidcVerifier } from '../src/auth/oidc';
import { ApiError } from '../src/errors';
import { startIdp, type Idp } from './support/idp';

/**
 * Token validation, against a real issuer over real HTTP.
 *
 * Every case here is one an attacker or an outage has actually caused somewhere:
 * a forged signature, a token minted for another API, one from another issuer, an
 * expired one, one with no expiry at all, the `HS256` trick where the public key
 * is used as a shared secret, and an issuer that is simply down. A verifier that
 * gets any of these wrong is not "mostly right".
 */

const closers: Idp[] = [];

async function idp(): Promise<Idp> {
  const server = await startIdp();
  closers.push(server);
  return server;
}

function verifierFor(
  server: Idp,
  overrides: Partial<Parameters<typeof createOidcVerifier>[0]> = {},
) {
  return createOidcVerifier({
    issuer: server.issuer,
    audience: server.audience,
    clientId: server.clientId,
    scopes: ['openid', 'profile', 'email'],
    clockSkewSeconds: 0,
    ...overrides,
  });
}

/** Run `verify` and return the `ApiError` it threw. */
async function refusal(verifier: OidcVerifier, token: string): Promise<ApiError> {
  try {
    await verifier.verify(token);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('the token was accepted, and it must not have been');
}

afterEach(async () => {
  await Promise.all(closers.splice(0).map((server) => server.close()));
});

describe('a token the issuer signed', () => {
  it('resolves to the subject, email and display name', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-ana', email: 'ana@example.org', name: 'Ana' });

    await expect(verifierFor(server).verify(token)).resolves.toEqual({
      sub: 'user-ana',
      email: 'ana@example.org',
      name: 'Ana',
    });
  });

  it('falls back to preferred_username, and to null when neither is present', async () => {
    const server = await idp();
    const verifier = verifierFor(server);

    await expect(
      verifier.verify(await server.issue({ sub: 'user-b', preferredUsername: 'b' })),
    ).resolves.toMatchObject({ name: 'b' });
    // A token with no name at all is still a valid identity: the subject is the
    // identity, everything else is a label the dashboard can do without.
    await expect(verifier.verify(await server.issue({ sub: 'user-c' }))).resolves.toEqual({
      sub: 'user-c',
      email: null,
      name: null,
    });
  });

  it('fetches the key set once and reuses it', async () => {
    const server = await idp();
    const verifier = verifierFor(server);

    await verifier.verify(await server.issue({ sub: 'user-a' }));
    await verifier.verify(await server.issue({ sub: 'user-a' }));
    await verifier.verify(await server.issue({ sub: 'user-a' }));

    // A per-request JWKS fetch would be an outage amplifier: every token would
    // cost the IdP a round trip.
    expect(server.jwksFetches()).toBe(1);
  });

  it('re-reads the key set after a reset', async () => {
    const server = await idp();
    const verifier = verifierFor(server);
    await verifier.verify(await server.issue({ sub: 'user-a' }));

    verifier.reset();
    await verifier.verify(await server.issue({ sub: 'user-a' }));

    expect(server.jwksFetches()).toBe(2);
  });

  it('describes what a dashboard needs to start a login', async () => {
    const server = await idp();
    expect(verifierFor(server).describe()).toEqual({
      issuer: server.issuer,
      clientId: server.clientId,
      scopes: ['openid', 'profile', 'email'],
    });
  });
});

describe('a token this API must refuse', () => {
  it('refuses an expired token', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-a', expiresIn: -120 });

    const error = await refusal(verifierFor(server), token);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/expired/);
  });

  it('refuses a token with no expiry at all', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-a', withoutExpiry: true });

    const error = await refusal(verifierFor(server), token);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/required claim/);
  });

  it('refuses a token minted for another audience', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-a', audience: 'some-other-api' });

    const error = await refusal(verifierFor(server), token);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/aud/);
  });

  it('refuses a token from another issuer', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-a', issuer: 'https://evil.example' });

    const error = await refusal(verifierFor(server), token);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/iss/);
  });

  it('refuses a signature made with a key the issuer never published', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-a', untrustedKey: true });

    const error = await refusal(verifierFor(server), token);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/signature/);
  });

  it('refuses a token whose kid the issuer does not publish', async () => {
    const server = await idp();
    const token = await server.issue({ sub: 'user-a', kid: 'a-key-that-does-not-exist' });

    const error = await refusal(verifierFor(server), token);
    expect(error.status).toBe(401);
  });

  it('refuses the HS256 trick: the public key as a shared secret', async () => {
    const server = await idp();
    // A classic confusion attack: sign HMAC with the RSA public key, which is
    // public, and hope the verifier picks the algorithm from the header.
    const response = await fetch(`${server.issuer}/jwks.json`);
    const { keys } = (await response.json()) as { keys: (JWK & { kid: string })[] };
    const pem = await exportSPKI(await importJWK(keys[0]!, 'RS256'));
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: keys[0]!.kid })
      .setSubject('user-a')
      .setIssuer(server.issuer)
      .setAudience(server.audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new Uint8Array(Buffer.from(pem)));

    const verified = verifierFor(server);
    const error = await refusal(verified, forged);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/algorithm/);
  });

  it('refuses something that is not a token', async () => {
    const server = await idp();
    const error = await refusal(verifierFor(server), 'not-a-token');
    expect(error.status).toBe(401);
  });
});

describe('an issuer that cannot answer', () => {
  it('answers 503, not 401, when discovery is unreachable', async () => {
    const server = await idp();
    const verifier = verifierFor(server);
    const token = await server.issue({ sub: 'user-a' });
    await server.close();

    const error = await refusal(verifier, token);
    // 401 would log every user out during an IdP outage and hide the fault.
    expect(error.status).toBe(503);
    expect(error.code).toBe('auth_unavailable');
  });

  it('answers 503 when the key set cannot be read', async () => {
    const server = await idp();
    const verifier = verifierFor(server);
    server.breakJwks();

    const error = await refusal(verifier, await server.issue({ sub: 'user-a' }));
    expect(error.status).toBe(503);
    expect(error.code).toBe('auth_unavailable');
  });

  it('answers 503 when the discovery document names another issuer', async () => {
    const server = await idp();
    server.lieAboutIssuer('https://evil.example');

    const error = await refusal(verifierFor(server), await server.issue({ sub: 'user-a' }));
    expect(error.status).toBe(503);
    expect(error.message).toMatch(/evil\.example/);
  });
});

describe('a discovery document that is not usable', () => {
  /**
   * These cases never reach the network: `fetch` is replaced for the duration of
   * the call, which is the only way to produce an issuer that answers with the
   * wrong *kind* of thing rather than the wrong answer.
   */
  async function withIssuerAnswer(
    answer: () => Response,
    assertion: (error: ApiError) => void,
  ): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => answer()) as unknown as typeof fetch;
    try {
      const verifier = createOidcVerifier({
        issuer: 'https://idp.example',
        audience: 'aeroscribe-api',
        clientId: 'aeroscribe-dashboard',
        scopes: [],
        clockSkewSeconds: 0,
      });
      assertion(await refusal(verifier, 'any.token.here'));
    } finally {
      globalThis.fetch = original;
    }
  }

  it('answers 503 when the discovery document answers non-200', async () => {
    await withIssuerAnswer(
      () => new Response('{}', { status: 404 }),
      (error) => {
        expect(error.status).toBe(503);
        expect(error.message).toMatch(/answered 404/);
      },
    );
  });

  it('answers 503 when the discovery document is not JSON', async () => {
    await withIssuerAnswer(
      () => new Response('<html>maintenance</html>', { status: 200 }),
      (error) => {
        expect(error.status).toBe(503);
        expect(error.message).toMatch(/not JSON/);
      },
    );
  });

  it('answers 503 when the discovery document has no jwks_uri', async () => {
    await withIssuerAnswer(
      () =>
        new Response(JSON.stringify({ issuer: 'https://idp.example' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      (error) => {
        expect(error.status).toBe(503);
        expect(error.message).toMatch(/no issuer or jwks_uri/);
      },
    );
  });
});
