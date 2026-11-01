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
import { createProcessCoordinator, type Coordinator } from '../src/coord';
import { createLogger } from '../src/lib/logger';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import {
  FilesystemAuditStore,
  FilesystemEvidenceStore,
  FilesystemRunStore,
  createStores,
  type Stores,
} from '../src/store';

let directory: string;
let orchestrator: Orchestrator;
let registry: FilesystemEvidenceStore;
let config: Config;

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
    ...overrides,
  };
}

function makeApp(overrides: Partial<Config> = {}, coordinator?: Coordinator, stores?: Stores) {
  config = makeConfig(overrides);
  return createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    ...(coordinator ? { coordinator } : {}),
    ...(stores ? { stores } : {}),
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-http-'));
  orchestrator = new Orchestrator({
    blobs: createFilesystemBlobStore({ dataDir: directory }),
    runs: new FilesystemRunStore(join(directory, 'runs')),
    registry: (registry = new FilesystemEvidenceStore(join(directory, 'registry.ndjson'))),
    audit: new FilesystemAuditStore(join(directory, 'audit.ndjson')),
    literature: new LiteratureService({ offline: true, providers: [] }),
    cfd: new CfdService({
      su2: { available: false, binary: null },
      workDir: join(directory, 'cfd'),
    }),
    newRunId: () => 'run-1',
    defaultOptions: { paperLimit: 2, verifyTop: 0 },
  });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function post(
  app: ReturnType<typeof makeApp>,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('health and capabilities', () => {
  it('reports that authentication is off when no key is configured', async () => {
    const app = makeApp();
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.authRequired).toBe(false);
    expect(body.capabilities.cfd.su2.available).toBe(false);
    expect(body.capabilities.literature.mode).toBe('offline');
  });

  it('reports the store backend and probes it on every call', async () => {
    const stores = createStores({ dataDir: directory, store: 'filesystem' });
    const app = makeApp({}, undefined, stores);

    const response = await app.request('/health');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.store).toMatchObject({ backend: 'filesystem', ok: true });

    const capabilities = await (await app.request('/api/v1/capabilities')).json();
    expect(capabilities.storage.backend).toBe('filesystem');
  });

  it('answers 503 when the store cannot be written', async () => {
    // The probe is the only health check an operator can fix, so it decides the
    // status code: a process that cannot persist anything is not healthy.
    const stores = createStores({ dataDir: directory, store: 'filesystem' });
    const failing: Stores = {
      ...stores,
      probe: async () => ({
        backend: 'filesystem',
        ok: false,
        detail: 'the data directory /nowhere is not writable: EACCES',
      }),
    };
    const app = makeApp({}, undefined, failing);

    const response = await app.request('/health');
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.store.ok).toBe(false);
    expect(body.store.detail).toMatch(/EACCES/);
    // The rest of the report is still there: a checker needs to see what else
    // the process knows while the store is down.
    expect(body.capabilities.auth.required).toBe(false);
  });

  it('is public even when auth is required, and says auth is required', async () => {
    const app = makeApp({ apiKey: 'secret' });
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect((await response.json()).authRequired).toBe(true);
  });

  it('describes capabilities without leaking the API key', async () => {
    const app = makeApp({ apiKey: 'super-secret-key' });
    const response = await app.request('/api/v1/capabilities', {
      headers: { authorization: 'Bearer super-secret-key' },
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain('super-secret-key');
  });
});

describe('authentication', () => {
  it('rejects a missing or wrong bearer token', async () => {
    const app = makeApp({ apiKey: 'secret' });

    const missing = await app.request('/api/v1/runs');
    expect(missing.status).toBe(401);
    expect((await missing.json()).error.code).toBe('unauthorized');

    const wrong = await app.request('/api/v1/runs', { headers: { authorization: 'Bearer nope' } });
    expect(wrong.status).toBe(401);
  });

  it('accepts the configured token, case-insensitively on the scheme', async () => {
    const app = makeApp({ apiKey: 'secret' });
    const response = await app.request('/api/v1/runs', {
      headers: { authorization: 'bearer secret' },
    });
    expect(response.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('returns 429 with a retryable error shape once the window is spent', async () => {
    let now = 0;
    const limiter = createProcessCoordinator({ limit: 2, windowMs: 1_000, now: () => now });
    const app = makeApp({}, limiter);

    expect((await app.request('/api/v1/runs')).status).toBe(200);
    expect((await app.request('/api/v1/runs')).status).toBe(200);

    const limited = await app.request('/api/v1/runs');
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('rate_limited');
    expect(limited.headers.get('x-ratelimit-remaining')).toBe('0');

    now = 1_001;
    expect((await app.request('/api/v1/runs')).status).toBe(200);
  });

  it('limits each client separately', async () => {
    const now = 0;
    const limiter = createProcessCoordinator({ limit: 1, windowMs: 1_000, now: () => now });
    const app = makeApp({}, limiter);

    await app.request('/api/v1/runs', { headers: { 'x-forwarded-for': '203.0.113.9' } });
    const other = await app.request('/api/v1/runs', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    expect(other.status).toBe(200);

    const same = await app.request('/api/v1/runs', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(same.status).toBe(429);
  });

  it('does not rate limit the health probe', async () => {
    const limiter = createProcessCoordinator({ limit: 1, windowMs: 60_000 });
    const app = makeApp({}, limiter);

    await app.request('/api/v1/runs');
    expect((await app.request('/health')).status).toBe(200);
  });
});

describe('runs', () => {
  it('creates a run and returns 201 with the full stage list', async () => {
    const app = makeApp();
    const response = await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });

    expect(response.status).toBe(201);
    const { run } = await response.json();
    expect(run.id).toBe('run-1');
    expect(run.stages).toHaveLength(9);
  });

  it('rejects invalid bodies with a 400 error shape', async () => {
    const app = makeApp();

    const missingTopic = await post(app, '/api/v1/runs', {});
    expect(missingTopic.status).toBe(400);
    expect((await missingTopic.json()).error).toMatchObject({ code: 'invalid_request' });

    const shortTopic = await post(app, '/api/v1/runs', { topic: 'drag' });
    expect(shortTopic.status).toBe(400);

    const badJson = await app.request('/api/v1/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(badJson.status).toBe(400);
    expect((await badJson.json()).error.message).toMatch(/not valid JSON/i);
  });

  it('rejects a topic that is too long to store in every artefact', async () => {
    const app = makeApp();
    const response = await post(app, '/api/v1/runs', { topic: 'x'.repeat(301) });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/300 characters/);
  });

  it('refuses a request body larger than a megabyte', async () => {
    const app = makeApp();
    const oversized = JSON.stringify({ topic: 'drag', padding: 'x'.repeat(1_100_000) });

    const response = await app.request('/api/v1/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversized,
    });

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
  });

  it('404s for an unknown run and for an unknown route', async () => {
    const app = makeApp();

    const unknownRun = await app.request('/api/v1/runs/run-nope');
    expect(unknownRun.status).toBe(404);
    expect((await unknownRun.json()).error.code).toBe('not_found');

    const unknownRoute = await app.request('/api/v1/nope');
    expect(unknownRoute.status).toBe(404);
  });

  it('advances a stage, appends evidence and exposes it', async () => {
    const app = makeApp();
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });

    const advanced = await post(app, '/api/v1/runs/run-1/advance', { actor: 'ana' });
    expect(advanced.status).toBe(200);
    const body = await advanced.json();
    expect(body.stage.id).toBe(0);
    expect(body.stage.status).toBe('gate_pending');
    expect(body.evidenceSeq).toBe(0);

    const evidence = await app.request('/api/v1/runs/run-1/evidence?kind=stage-output');
    const { records } = await evidence.json();
    expect(records).toHaveLength(1);
    expect(records[0].seq).toBe(0);

    const verify = await app.request('/api/v1/evidence/verify');
    expect(await verify.json()).toMatchObject({ valid: true, records: 1 });
  });

  it('rejects an unknown evidence kind', async () => {
    const app = makeApp();
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });

    const response = await app.request('/api/v1/runs/run-1/evidence?kind=guess');
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.allowed).toContain('cfd-run');
  });

  it('409s when advancing past an unapproved gate, and the audit trail records the gate', async () => {
    const app = makeApp();
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    await post(app, '/api/v1/runs/run-1/advance');

    const blocked = await post(app, '/api/v1/runs/run-1/advance');
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.message).toMatch(/GATE-0/);

    const approved = await post(app, '/api/v1/runs/run-1/gates/GATE-0/approve', {
      actor: 'reviewer',
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).run.currentStage).toBe(1);

    const audit = await app.request('/api/v1/audit?runId=run-1');
    const { entries, malformed } = await audit.json();
    expect(malformed).toBe(0);
    expect(entries.map((entry: { action: string }) => entry.action)).toContain('gate.approved');
    expect(
      entries.find((entry: { action: string }) => entry.action === 'gate.approved').actor,
    ).toBe('reviewer');
  });

  it('rejects a gate with a note and re-runs the stage', async () => {
    const app = makeApp();
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    await post(app, '/api/v1/runs/run-1/advance');

    const rejected = await post(app, '/api/v1/runs/run-1/gates/GATE-0/reject', {
      actor: 'reviewer',
      note: 'Too broad.',
    });
    expect(rejected.status).toBe(200);
    expect((await rejected.json()).run.stages[0]).toMatchObject({
      status: 'running',
      revisionCount: 1,
    });
  });
});

describe('reference re-checks', () => {
  /** A manuscript record with one DOI, written directly into the registry. */
  async function seedManuscript(runId: string, doi: string | null): Promise<void> {
    await registry.append({
      kind: 'manuscript',
      runId,
      stageId: 5,
      label: 'seeded manuscript for the re-check test',
      payload: {
        stage: 'paper-synthesis',
        schemaVersion: 2,
        title: 'Seeded manuscript',
        journal: 'AIAA Journal',
        journalId: 'aiaa-journal',
        sections: [],
        abstract: 'Seeded.',
        wordCount: 1,
        referenceCount: 1,
        references: [
          {
            index: 1,
            doi: doi ?? '',
            citation: 'Seeded citation line.',
            record: {
              key: 'ref-01',
              index: 1,
              doi,
              title: 'Transonic drag prediction on unstructured meshes',
              authors: ['A. Author'],
              year: 2024,
              venue: 'AIAA Journal',
              volume: null,
              pages: null,
              publisher: null,
              url: null,
              verified: {
                verifiedAt: '2026-10-01T00:00:00.000Z',
                provider: 'crossref',
                titleSimilarity: 1,
              },
            },
          },
        ],
        numbers: {},
        generatedAt: '2026-10-01T00:00:00.000Z',
        synthetic: true,
      },
    });
  }

  async function createRun(app: ReturnType<typeof makeApp>): Promise<string> {
    const response = await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    return ((await response.json()) as { run: { id: string } }).run.id;
  }

  it('409s when the run has no manuscript to re-check', async () => {
    const app = makeApp();
    const runId = await createRun(app);

    const recheck = await post(app, `/api/v1/runs/${runId}/references/recheck`);
    expect(recheck.status).toBe(409);
    expect(((await recheck.json()) as { error: { message: string } }).error.message).toMatch(
      /no manuscript yet/,
    );

    expect((await app.request(`/api/v1/runs/${runId}/references`)).status).toBe(409);
    expect((await app.request('/api/v1/runs/run-unknown/references')).status).toBe(404);
  });

  it('appends one record and reports the run offline rather than verified', async () => {
    const app = makeApp();
    const runId = await createRun(app);
    await seedManuscript(runId, '10.2514/1.j060001');

    const before = (await registry.list({ runId })).length;
    const response = await post(app, `/api/v1/runs/${runId}/references/recheck`);

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      record: { kind: string; seq: number; stageId: number | null };
      summary: { total: number; unverified: number; fresh: number };
      offline: boolean;
    };
    expect(body.record.kind).toBe('doi-recheck');
    expect(body.record.stageId).toBeNull();
    expect(body.offline).toBe(true);
    // Offline cannot verify anything, and does not pretend otherwise.
    expect(body.summary).toMatchObject({ total: 1, unverified: 1, fresh: 0 });
    expect((await registry.list({ runId })).length).toBe(before + 1);

    const statusResponse = await app.request(`/api/v1/runs/${runId}/references`);
    expect(statusResponse.status).toBe(200);
    const status = (await statusResponse.json()) as {
      status: string;
      rechecks: number;
      checkedAt: string | null;
      references: Array<{
        key: string;
        citation: string;
        verifiedAt: string | null;
        latest: { status: string; seq: number } | null;
      }>;
    };
    expect(status.status).toBe('unverified');
    expect(status.rechecks).toBe(1);
    expect(status.checkedAt).not.toBeNull();
    expect(status.references).toHaveLength(1);
    expect(status.references[0]).toMatchObject({
      key: 'ref-01',
      citation: 'Seeded citation line.',
      // The generation-time verification is still reported, unchanged.
      verifiedAt: '2026-10-01T00:00:00.000Z',
      latest: { status: 'unverified', seq: body.record.seq },
    });

    // The re-check is in the audit trail, and the registry still verifies.
    const audit = (await (await app.request(`/api/v1/audit?runId=${runId}`)).json()) as {
      entries: Array<{ action: string }>;
    };
    expect(audit.entries.some((entry) => entry.action === 'doi.rechecked')).toBe(true);
    expect(
      ((await (await app.request('/api/v1/evidence/verify')).json()) as { valid: boolean }).valid,
    ).toBe(true);
  });
});

describe('literature and claims', () => {
  it('searches the offline corpus and reports that it is offline', async () => {
    const app = makeApp();
    const response = await app.request(
      '/api/v1/literature/search?q=transonic%20wing%20drag&limit=3',
    );

    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.papers.length).toBeLessThanOrEqual(3);
    expect(report.offline).toBe(true);
  });

  it('rejects a query that is too short', async () => {
    const app = makeApp();
    expect((await app.request('/api/v1/literature/search?q=ai')).status).toBe(400);
  });

  it('verifies a DOI and returns 422 for one that does not resolve', async () => {
    const app = makeApp();
    const response = await post(app, '/api/v1/literature/verify-doi', {
      doi: '10.1016/j.ast.2024.01.001',
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(body.reason).toMatch(/offline/i);
  });

  it('requires a runId to verify claims, then checks them against that run', async () => {
    const app = makeApp();
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    await post(app, '/api/v1/runs/run-1/advance');

    const noRun = await post(app, '/api/v1/claims/verify', { text: 'The drag is 0.5.' });
    expect(noRun.status).toBe(400);

    const invented = await post(app, '/api/v1/claims/verify', {
      runId: 'run-1',
      text: 'The drag coefficient is 0.9999.',
    });
    expect(invented.status).toBe(200);
    expect((await invented.json()).ok).toBe(false);

    const unknownRun = await post(app, '/api/v1/claims/verify', {
      runId: 'run-x',
      text: 'The drag is 0.5.',
    });
    expect(unknownRun.status).toBe(404);
  });
});

describe('request correlation and logs', () => {
  function appWithLogs(overrides: Partial<Config> = {}) {
    const lines: Array<Record<string, unknown>> = [];
    const logger = createLogger({
      level: 'debug',
      sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    });
    const app = createApp({
      orchestrator,
      config: makeConfig(overrides),
      capabilities: () => describeCapabilities(config),
      logger,
    });
    return { app, lines };
  }

  it('echoes an inbound request id and logs it with the outcome', async () => {
    const { app, lines } = appWithLogs();
    const response = await app.request('/health', { headers: { 'x-request-id': 'abc-123' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('abc-123');
    const request = lines.find((line) => line.event === 'http.request');
    expect(request).toMatchObject({
      request_id: 'abc-123',
      method: 'GET',
      path: '/health',
      status: 200,
    });
  });

  it('generates a request id when the caller sends none', async () => {
    const { app } = appWithLogs();
    const response = await app.request('/health');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('binds the run id from the path to every line of that request', async () => {
    const { app, lines } = appWithLogs();
    await app.request('/api/v1/runs/run-1');

    // The route 404s (no such run) but the correlation happened before dispatch.
    expect(lines.some((line) => line.run_id === 'run-1')).toBe(true);
  });

  it('logs a rejected request once, at warn, with the path but no credential', async () => {
    const { app, lines } = appWithLogs({ apiKey: 'secret' });
    await app.request('/api/v1/runs', { headers: { authorization: 'Bearer nope' } });

    const rejected = lines.filter((line) => line.event === 'http.unauthorised');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ path: '/api/v1/runs' });
    expect(JSON.stringify(rejected[0])).not.toContain('nope');
  });

  it('never writes a configured secret into a log line', async () => {
    const { app, lines } = appWithLogs({ apiKey: 'super-secret-key-123' });
    await app.request('/api/v1/runs', { headers: { authorization: 'Bearer wrong-token' } });

    expect(JSON.stringify(lines)).not.toContain('super-secret-key-123');
  });

  it('reports the release and log level in /health', async () => {
    const { app } = appWithLogs({ version: '1.2.3', commit: 'abc1234' });
    const body = await (await app.request('/health')).json();

    expect(body).toMatchObject({ version: '1.2.3', commit: 'abc1234', logLevel: 'silent' });
  });
});

describe('CORS', () => {
  it('allows the configured dashboard origin and refuses others', async () => {
    const app = makeApp({ corsOrigins: ['http://localhost:5174'] });

    const allowed = await app.request('/api/v1/runs', {
      headers: { origin: 'http://localhost:5174' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');

    const refused = await app.request('/api/v1/runs', {
      headers: { origin: 'https://evil.example' },
    });
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });
});
