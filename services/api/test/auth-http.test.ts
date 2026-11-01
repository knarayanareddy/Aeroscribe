// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { describeCapabilities } from '../src/config';
import { createFilesystemBlobStore } from '../src/blob';
import { CfdService } from '../src/cfd';
import { createApp } from '../src/http/app';
import { createAuthenticator } from '../src/auth';
import { createProcessCoordinator } from '../src/coord';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import {
  FilesystemAuditStore,
  FilesystemEvidenceStore,
  FilesystemRunStore,
  FilesystemUserStore,
} from '../src/store';
import { startIdp, type Idp } from './support/idp';

/**
 * Accounts, end to end: a real token, a real signature check, a real user store.
 *
 * The acceptance case for this workstream is one sentence — *A creates a run and
 * approves GATE-0; B is refused, and the audit says `user:<A>` even when the
 * body claims to be B* — and it is asserted here against the same `createApp`
 * the process boots, with tokens signed by a real issuer over HTTP. Nothing in
 * this file is a stubbed-out permission check.
 */

let directory: string;
let orchestrator: Orchestrator;
let users: FilesystemUserStore;
let idp: Idp;
let config: Config;

const A = 'user-ana';
const B = 'user-bruno';
const ADMIN = 'user-admin';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 0,
    dataDir: directory,
    apiKey: '',
    contactEmail: '',
    offline: true,
    su2Binary: null,
    corsOrigins: ['http://localhost:5174'],
    upstreamTimeoutMs: 5_000,
    retryBaseDelayMs: 1,
    latexBinary: null,
    latexTimeoutMs: 5_000,
    store: 'filesystem',
    databaseUrl: null,
    coordination: 'process',
    redisUrl: null,
    doiMaxAgeDays: 30,
    logLevel: 'silent',
    version: 'test',
    commit: 'test',
    auth: {
      mode: 'oidc',
      apiKey: '',
      adminSubs: [ADMIN],
      oidc: {
        issuer: idp.issuer,
        audience: idp.audience,
        clientId: idp.clientId,
        scopes: ['openid', 'profile'],
        clockSkewSeconds: 0,
      },
    },
    ...overrides,
  };
}

function makeApp(options: { limit?: number; config?: Partial<Config> } = {}) {
  config = makeConfig(options.config);
  const authenticator = createAuthenticator({
    settings: config.auth!,
    users,
  });
  return createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    authenticator,
    users,
    coordinator: createProcessCoordinator({ limit: options.limit ?? 1_000, windowMs: 60_000 }),
  });
}

type App = ReturnType<typeof makeApp>;

/** A request carrying a freshly signed token for `sub`. */
async function as(
  app: App,
  sub: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const token = await idp.issue({ sub });
  return app.request(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function errorOf(response: Response): Promise<{ code: string; message: string }> {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return body.error;
}

/** Create a run as `sub` and advance it to its first gate. Returns the run id. */
async function runAtGate(app: App, sub: string): Promise<string> {
  const created = await as(app, sub, '/api/v1/runs', {
    body: { topic: 'transonic wing drag prediction' },
  });
  expect(created.status).toBe(201);
  const { run } = (await created.json()) as { run: { id: string } };

  const advanced = await as(app, sub, `/api/v1/runs/${run.id}/advance`, { body: {} });
  expect(advanced.status).toBe(200);
  expect((await advanced.json()).stage.status).toBe('gate_pending');
  return run.id;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-auth-'));
  idp = await startIdp();
  users = new FilesystemUserStore(join(directory, 'users.ndjson'));
  orchestrator = new Orchestrator({
    blobs: createFilesystemBlobStore({ dataDir: directory }),
    runs: new FilesystemRunStore(join(directory, 'runs')),
    registry: new FilesystemEvidenceStore(join(directory, 'registry.ndjson')),
    audit: new FilesystemAuditStore(join(directory, 'audit.ndjson')),
    literature: new LiteratureService({ offline: true, providers: [] }),
    cfd: new CfdService({
      su2: { available: false, binary: null },
      workDir: join(directory, 'cfd'),
    }),
    defaultOptions: { paperLimit: 2, verifyTop: 0 },
  });
});

afterEach(async () => {
  await idp.close();
  await rm(directory, { recursive: true, force: true });
});

describe('the acceptance case', () => {
  it('lets A create and gate a run, and refuses B', async () => {
    const app = makeApp();

    const runId = await runAtGate(app, A);

    // B is a researcher with no claim on A's run: read and gate both refuse,
    // and the gate is still pending, so the refusal is about the role and the
    // owner rather than about the state of the run.
    const read = await as(app, B, `/api/v1/runs/${runId}`);
    expect(read.status).toBe(403);
    expect((await errorOf(read)).message).toMatch(/another account/);

    const refused = await as(app, B, `/api/v1/runs/${runId}/gates/GATE-0/approve`, {
      body: {},
    });
    expect(refused.status).toBe(403);

    // A approves gate 0 — the researcher's own run, which the roadmap asks for.
    // The body claims to be somebody else; the audit must not believe it.
    const approved = await as(app, A, `/api/v1/runs/${runId}/gates/GATE-0/approve`, {
      body: { actor: 'somebody-else' },
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).run.currentStage).toBe(1);

    // ...and the audit trail names the *verified* subject, not the body's claim.
    const audit = await as(app, A, `/api/v1/audit?runId=${runId}`);
    expect(audit.status).toBe(200);
    const { entries } = (await audit.json()) as {
      entries: { action: string; actor: string }[];
    };
    const approval = entries.find((entry) => entry.action === 'gate.approved');
    expect(approval).toBeDefined();
    expect(approval!.actor).toBe(`user:${A}`);
    expect(entries.map((entry) => entry.actor)).not.toContain('somebody-else');
  });

  it('lets a reviewer approve a run it does not own, and still records the reviewer', async () => {
    const app = makeApp();
    const runId = await runAtGate(app, A);

    // B logs in once as a researcher, then an admin promotes them.
    await as(app, B, '/api/v1/me');
    const promoted = await as(app, ADMIN, `/api/v1/users/${B}`, {
      method: 'PATCH',
      body: { role: 'reviewer' },
    });
    expect(promoted.status).toBe(200);
    expect((await promoted.json()).user.role).toBe('reviewer');

    const approved = await as(app, B, `/api/v1/runs/${runId}/gates/GATE-0/approve`, {
      body: {},
    });
    expect(approved.status).toBe(200);

    const audit = await as(app, B, `/api/v1/audit?runId=${runId}`);
    const { entries } = (await audit.json()) as { entries: { action: string; actor: string }[] };
    expect(entries.find((entry) => entry.action === 'gate.approved')!.actor).toBe(`user:${B}`);

    // A reviewer judges; it does not produce. Advancing is refused even here.
    const advance = await as(app, B, `/api/v1/runs/${runId}/advance`, { body: {} });
    expect(advance.status).toBe(403);
    expect((await errorOf(advance)).message).toMatch(/reviewer/);
  });

  it('shows a researcher their own runs and a reviewer every run', async () => {
    const app = makeApp();
    await runAtGate(app, A);
    await as(app, B, '/api/v1/me');
    await as(app, ADMIN, `/api/v1/users/${B}`, { method: 'PATCH', body: { role: 'reviewer' } });

    const mine = (await (await as(app, A, '/api/v1/runs')).json()) as { runs: unknown[] };
    expect(mine.runs).toHaveLength(1);

    const theirs = (await (await as(app, B, '/api/v1/runs')).json()) as { runs: unknown[] };
    expect(theirs.runs).toHaveLength(1);

    // A third researcher, who owns nothing, sees nothing — not an empty list of
    // somebody else's work.
    const stranger = (await (await as(app, 'user-cy', '/api/v1/runs')).json()) as {
      runs: unknown[];
    };
    expect(stranger.runs).toEqual([]);
  });
});

describe('credentials', () => {
  it('answers 401 without a token, and says which mode to use', async () => {
    const app = makeApp();
    const response = await app.request('/api/v1/runs');
    expect(response.status).toBe(401);
    expect((await errorOf(response)).message).toMatch(/bearer token/i);
  });

  it('answers 401 for an expired token', async () => {
    const app = makeApp();
    const token = await idp.issue({ sub: A, expiresIn: -60 });
    const response = await app.request('/api/v1/runs', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    expect((await errorOf(response)).message).toMatch(/expired/);
  });

  it('answers 401 for a token from another audience', async () => {
    const app = makeApp();
    const token = await idp.issue({ sub: A, audience: 'someone-else' });
    const response = await app.request('/api/v1/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it('answers 503 when the issuer is down, not 401', async () => {
    const app = makeApp();
    const token = await idp.issue({ sub: A });
    await idp.close();

    const response = await app.request('/api/v1/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(503);
    expect((await errorOf(response)).code).toBe('auth_unavailable');
  });

  it('describes the login without requiring one', async () => {
    const app = makeApp();
    const response = await app.request('/api/v1/auth/config');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'oidc',
      required: true,
      issuer: idp.issuer,
      clientId: idp.clientId,
      scopes: ['openid', 'profile'],
    });
  });
});

describe('accounts', () => {
  it('reports who the caller is, and what they may do', async () => {
    const app = makeApp();
    // A first login creates the account, so `/me` is also the first write.
    const me = await as(app, A, '/api/v1/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      authMode: 'oidc',
      principal: { sub: A, email: null, name: null, role: 'researcher' },
    });
  });

  it('promotes a configured admin subject on first sight, and is stable on login', async () => {
    const app = makeApp();
    const first = (await (await as(app, ADMIN, '/api/v1/me')).json()) as {
      principal: { role: string };
    };
    // `AEROSCRIBE_ADMIN_SUBS` is how a deployment gets its first admin: there is
    // no bootstrap account and no password to set.
    expect(first.principal.role).toBe('admin');

    const second = (await (await as(app, ADMIN, '/api/v1/me')).json()) as {
      principal: { role: string };
    };
    expect(second).toEqual(first);
  });

  it('refuses the account list to a researcher and lists it for an admin', async () => {
    const app = makeApp();
    await as(app, A, '/api/v1/me');
    await as(app, ADMIN, '/api/v1/me');

    const refused = await as(app, A, '/api/v1/users');
    expect(refused.status).toBe(403);

    const listed = await as(app, ADMIN, '/api/v1/users');
    expect(listed.status).toBe(200);
    const { users: accounts } = (await listed.json()) as {
      users: { sub: string; role: string }[];
    };
    // Both accounts were created in the same millisecond, so the *order* is the
    // sub breaking a timestamp tie — compare as a set, not as a sequence.
    expect(accounts.map((user) => [user.sub, user.role]).sort()).toEqual([
      [ADMIN, 'admin'],
      [A, 'researcher'],
    ]);
  });

  it('audits a role change, and refuses to let an admin demote themselves', async () => {
    const app = makeApp();
    await as(app, A, '/api/v1/me');

    const promoted = await as(app, ADMIN, `/api/v1/users/${A}`, {
      method: 'PATCH',
      body: { role: 'reviewer' },
    });
    expect(promoted.status).toBe(200);

    const audit = await as(app, ADMIN, '/api/v1/audit');
    const { entries } = (await audit.json()) as { entries: { action: string; actor: string }[] };
    const change = entries.find((entry) => entry.action === 'user.role_changed');
    expect(change).toBeDefined();
    expect(change!.actor).toBe(`user:${ADMIN}`);

    const self = await as(app, ADMIN, `/api/v1/users/${ADMIN}`, {
      method: 'PATCH',
      body: { role: 'researcher' },
    });
    expect(self.status).toBe(409);
    expect((await errorOf(self)).code).toBe('self_demotion');
  });

  it('names the missing role when a researcher tries to change one', async () => {
    const app = makeApp();
    await as(app, A, '/api/v1/me');

    const refused = await as(app, A, `/api/v1/users/${A}`, {
      method: 'PATCH',
      body: { role: 'admin' },
    });
    expect(refused.status).toBe(403);
    // The sentence has to say what would have been enough; "forbidden" leaves a
    // person guessing whether they mistyped or are not allowed.
    expect((await errorOf(refused)).message).toMatch(/researcher.*change a role.*admin/s);
  });

  it('404s for a subject that has never logged in, and 400s for an unknown role', async () => {
    const app = makeApp();

    const unknown = await as(app, ADMIN, '/api/v1/users/user-nobody', {
      method: 'PATCH',
      body: { role: 'reviewer' },
    });
    expect(unknown.status).toBe(404);

    await as(app, ADMIN, '/api/v1/me');
    const badRole = await as(app, ADMIN, `/api/v1/users/${ADMIN}`, {
      method: 'PATCH',
      body: { role: 'superuser' },
    });
    expect(badRole.status).toBe(400);
  });
});

describe('the rate limit', () => {
  it('spends each subject’s budget separately', async () => {
    // Two requests per subject: enough to prove the key is the subject, not the
    // connection. Before accounts, both callers shared one budget.
    const app = makeApp({ limit: 2 });

    expect((await as(app, A, '/api/v1/me')).status).toBe(200);
    expect((await as(app, A, '/api/v1/me')).status).toBe(200);
    const third = await as(app, A, '/api/v1/me');
    expect(third.status).toBe(429);

    expect((await as(app, B, '/api/v1/me')).status).toBe(200);
  });

  it('does not spend the budget of a request it refused', async () => {
    const app = makeApp({ limit: 1 });
    // An unauthenticated request is refused before the limiter counts it, so an
    // attacker cannot exhaust a victim's budget by hammering without a token.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await app.request('/api/v1/me')).status).toBe(401);
    }
    expect((await as(app, A, '/api/v1/me')).status).toBe(200);
  });
});

describe('deployments without people', () => {
  it('keeps `token` mode exactly as it was: a shared key, no ownership', async () => {
    const app = makeApp({
      config: { auth: { mode: 'token', apiKey: 'secret-key', adminSubs: [], oidc: null } },
    });

    const refused = await app.request('/api/v1/runs', {
      headers: { authorization: 'Bearer wrong' },
    });
    expect(refused.status).toBe(401);

    const accepted = await app.request('/api/v1/runs', {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(accepted.status).toBe(200);

    // No principal, so no role checks: the body's actor is what gets recorded.
    const me = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(await me.json()).toEqual({ authMode: 'token', principal: null });

    const users = await app.request('/api/v1/users', {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(users.status).toBe(403);
    expect((await errorOf(users)).code).toBe('auth_mode_unsupported');
  });
});
