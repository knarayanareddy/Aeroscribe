import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

/**
 * A real OpenID Connect issuer for the tests, on loopback.
 *
 * It is a real HTTP server serving a real discovery document and a real JWKS,
 * and it signs with a real RSA key: the API's verifier reaches it over TCP,
 * fetches the keys, and validates a signature it did not produce. That is the
 * only way to test the code that matters — a mocked verifier would prove that
 * the mock works.
 *
 * What it is *not*: an IdP. There are no users, no browser flow, no token
 * endpoint. The dashboard's PKCE exchange is tested against its own injected
 * `fetch` in `apps/dashboard/src/auth`, because what it sends is a request
 * shape, not a cryptographic operation.
 */

export interface IdpOptions {
  /** Extra claims to merge into every token. */
  claims?: Record<string, unknown>;
}

export interface IssueOptions {
  /** Subject. */
  sub: string;
  /** Overrides the default audience. */
  audience?: string;
  /** Overrides the default issuer. */
  issuer?: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  /** Lifetime in seconds; negative makes an already-expired token. */
  expiresIn?: number;
  /** Sign with a key the issuer never publishes (a forged token). */
  untrustedKey?: boolean;
  /** Omit `exp`, which a strict verifier must refuse. */
  withoutExpiry?: boolean;
  /** Explicit `kid`, so a test can ask for a key the issuer does not have. */
  kid?: string;
}

export interface Idp {
  /** The issuer identifier, e.g. `http://127.0.0.1:53421`. */
  issuer: string;
  audience: string;
  clientId: string;
  /** Sign a token as this issuer. */
  issue(options: IssueOptions): Promise<string>;
  /** Withdraw the key set (simulates an issuer that cannot answer). */
  breakJwks(): void;
  /** Serve a discovery document naming a *different* issuer. */
  lieAboutIssuer(value: string): void;
  /** Count of JWKS fetches, so a test can see the cache working or not. */
  jwksFetches(): number;
  /** Stop the server. */
  close(): Promise<void>;
}

const KID = 'test-key-1';

export async function startIdp(options: IdpOptions = {}): Promise<Idp> {
  const { publicKey, privateKey: signingKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  const { privateKey: untrustedKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

  let jwksBroken = false;
  let jwksHits = 0;
  let issuerOverride: string | null = null;
  let server: Server | null = null;

  server = createServer((request, response) => {
    const url = request.url ?? '/';
    if (url.startsWith('/.well-known/openid-configuration')) {
      const origin = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          // The spec requires this to equal the issuer the client was configured
          // with; `lieAboutIssuer` breaks that on purpose.
          issuer: issuerOverride ?? origin,
          jwks_uri: `${origin}/jwks.json`,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        }),
      );
      return;
    }

    if (url.startsWith('/jwks.json')) {
      jwksHits += 1;
      if (jwksBroken) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'unavailable' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });

  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    audience: 'aeroscribe-api',
    clientId: 'aeroscribe-dashboard',

    async issue(issue: IssueOptions): Promise<string> {
      const now = Math.floor(Date.now() / 1000);
      const payload: Record<string, unknown> = {
        ...options.claims,
        ...(issue.email ? { email: issue.email } : {}),
        ...(issue.name ? { name: issue.name } : {}),
        ...(issue.preferredUsername ? { preferred_username: issue.preferredUsername } : {}),
      };

      const token = new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: issue.kid ?? KID, typ: 'JWT' })
        .setSubject(issue.sub)
        .setIssuer(issue.issuer ?? issuer)
        .setAudience(issue.audience ?? 'aeroscribe-api')
        .setIssuedAt(now - 1);

      if (!issue.withoutExpiry) token.setExpirationTime(now + (issue.expiresIn ?? 300));

      return token.sign(issue.untrustedKey ? untrustedKey : signingKey);
    },

    breakJwks: () => {
      jwksBroken = true;
    },
    lieAboutIssuer: (value: string) => {
      issuerOverride = value;
    },
    jwksFetches: () => jwksHits,

    async close(): Promise<void> {
      if (server === null) return;
      const closing = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        closing.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
