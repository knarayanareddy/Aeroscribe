// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { describeCapabilities } from '../src/config';
import { createCoordinator, createRedisCoordinator, redactRedisUrl } from '../src/coord';
import { CoordinationUnavailableError } from '../src/errors';
import { createFilesystemBlobStore } from '../src/blob';
import { CfdService } from '../src/cfd';
import { createApp } from '../src/http/app';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import { FilesystemAuditStore, FilesystemEvidenceStore, FilesystemRunStore } from '../src/store';
import { redisAvailability, startRedis, type RedisFixture } from './support/redis';

/**
 * The two things a second API instance cannot do alone, against a real Redis.
 *
 * The suite is skipped, with its reason in the title, when no server is
 * available — a double would pass every assertion here while proving nothing
 * about the two properties that matter: one budget shared between instances,
 * and a lock one instance cannot take from another.
 *
 * Every test namespaces its keys, so a shared server and parallel test files
 * cannot see each other's counters.
 */

const availability = redisAvailability();

// A skip is the right answer on a laptop without Redis and the wrong answer on
// a runner that was told to provide one: the jobs in `.github/workflows/ci.yml`
// start a `redis:7` service, so a skip there means the variable or the service
// is broken and the suite silently stopped testing the thing it exists for.
if (process.env.GITHUB_ACTIONS === 'true' && !availability.available) {
  throw new Error(`Redis is required on CI. ${(availability as { reason: string }).reason}`);
}

describe('redactRedisUrl', () => {
  it('removes credentials and leaves the address', () => {
    expect(redactRedisUrl('redis://user:hunter2@cache.internal:6379/0')).toBe(
      'redis://cache.internal:6379/0',
    );
    expect(redactRedisUrl('redis://cache.internal:6379/0')).toBe('redis://cache.internal:6379/0');
    // Never a reason to guess: an unparseable value prints nothing at all.
    expect(redactRedisUrl('not a url with a secret')).toBe('redis://(unparseable)');
  });
});

describe.skipIf(!availability.available)(
  availability.available
    ? 'coordination over a real Redis'
    : `coordination over a real Redis (skipped: ${(availability as { reason: string }).reason})`,
  () => {
    let fixture: RedisFixture;
    let directory: string;
    let scope: string;

    beforeAll(async () => {
      fixture = await startRedis();
    });

    afterAll(async () => {
      await fixture.stop();
    });

    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'aeroscribe-redis-http-'));
      scope = `${fixture.keyPrefix}:${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    });

    afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    const coordinator = (
      overrides: { limit?: number; windowMs?: number; lockTtlMs?: number } = {},
    ) =>
      createRedisCoordinator({
        url: fixture.url,
        keyPrefix: scope,
        ...overrides,
      });

    const makeConfig = (): Config => ({
      host: '127.0.0.1',
      port: 0,
      dataDir: directory,
      apiKey: '',
      contactEmail: '',
      offline: true,
      su2Binary: null,
      corsOrigins: [],
      upstreamTimeoutMs: 5_000,
      retryBaseDelayMs: 1,
      latexBinary: null,
      latexTimeoutMs: 5_000,
      store: 'filesystem',
      databaseUrl: null,
      coordination: 'redis',
      redisUrl: fixture.url,
      doiMaxAgeDays: 30,
      logLevel: 'silent',
      version: 'test',
      commit: 'test',
    });

    const makeOrchestrator = (
      name: string,
      coordination?: ReturnType<typeof coordinator>,
    ): Orchestrator =>
      new Orchestrator({
        blobs: createFilesystemBlobStore({ dataDir: directory, name }),
        runs: new FilesystemRunStore(join(directory, name, 'runs')),
        registry: new FilesystemEvidenceStore(join(directory, name, 'registry.ndjson')),
        audit: new FilesystemAuditStore(join(directory, name, 'audit.ndjson')),
        literature: new LiteratureService({ offline: true, providers: [] }),
        cfd: new CfdService({
          su2: { available: false, binary: null },
          workDir: join(directory, name, 'cfd'),
        }),
        ...(coordination ? { coordination } : {}),
        newRunId: () => 'run-1',
        defaultOptions: { paperLimit: 2, verifyTop: 0 },
      });

    it('spends one budget between two instances', async () => {
      const first = coordinator({ limit: 2, windowMs: 60_000 });
      const second = coordinator({ limit: 2, windowMs: 60_000 });

      expect(await first.limit('anonymous')).toMatchObject({ allowed: true, remaining: 1 });
      // The whole point: the second instance sees the first one's request.
      expect(await second.limit('anonymous')).toMatchObject({ allowed: true, remaining: 0 });
      expect(await first.limit('anonymous')).toMatchObject({ allowed: false });

      // A different key is a different budget.
      expect(await second.limit('somebody-else')).toMatchObject({ allowed: true });

      await first.close?.();
      await second.close?.();
    });

    it('resets the window when it elapses', async () => {
      const instance = coordinator({ limit: 1, windowMs: 150 });
      expect(await instance.limit('k')).toMatchObject({ allowed: true });
      expect(await instance.limit('k')).toMatchObject({ allowed: false });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(await instance.limit('k')).toMatchObject({ allowed: true, remaining: 0 });
      await instance.close?.();
    });

    it('lets exactly one instance hold a run', async () => {
      const first = coordinator();
      const second = coordinator();

      const lease = await first.acquireRun('run-1');
      expect(lease).not.toBeNull();
      expect(await second.acquireRun('run-1')).toBeNull();

      // A different run is a different lock.
      expect(await second.acquireRun('run-2')).not.toBeNull();

      await lease?.release();
      const retaken = await second.acquireRun('run-1');
      expect(retaken).not.toBeNull();
      await retaken?.release();

      await first.close?.();
      await second.close?.();
    });

    it('hands an expired lease over, and the loser cannot free the winner', async () => {
      // TTL 200ms, heartbeat every max(250, ttl/3) — so the first holder lets
      // the lease go before its heartbeat could renew it.
      const stale = coordinator({ lockTtlMs: 200 });
      const fresh = coordinator({ lockTtlMs: 60_000 });

      const lost = await stale.acquireRun('run-1');
      expect(lost).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const winner = await fresh.acquireRun('run-1');
      expect(winner).not.toBeNull();

      // The slow instance finishing late must not delete the new owner's lock.
      await lost?.release();
      expect(await coordinator().acquireRun('run-1')).toBeNull();

      await winner?.release();
      expect(await coordinator().acquireRun('run-1')).not.toBeNull();

      await stale.close?.();
      await fresh.close?.();
    }, 15_000);

    it('keeps a long stage’s lease alive with a heartbeat', async () => {
      const holder = coordinator({ lockTtlMs: 600 });
      const other = coordinator({ lockTtlMs: 600 });

      const lease = await holder.acquireRun('run-1');
      expect(lease).not.toBeNull();

      // Three times the TTL: without the heartbeat the lock would be gone.
      await new Promise((resolve) => setTimeout(resolve, 1_800));
      expect(await other.acquireRun('run-1')).toBeNull();

      await lease?.release();
      expect(await other.acquireRun('run-1')).not.toBeNull();

      await holder.close?.();
      await other.close?.();
    }, 15_000);

    it('answers 429 on the 61st request when two apps share the budget', async () => {
      const makeInstance = (name: string) => {
        const app = createApp({
          orchestrator: makeOrchestrator(name),
          config: makeConfig(),
          capabilities: () => describeCapabilities(makeConfig()),
          // Two processes, one Redis — the situation RULE-013's limit is for.
          coordinator: coordinator({ limit: 60, windowMs: 60_000 }),
        });
        return app;
      };

      const first = makeInstance('a');
      const second = makeInstance('b');

      for (let index = 0; index < 60; index += 1) {
        const app = index % 2 === 0 ? first : second;
        expect((await app.request('/api/v1/runs')).status, `request ${index + 1}`).toBe(200);
      }

      const limited = await second.request('/api/v1/runs');
      expect(limited.status).toBe(429);
      expect((await limited.json()).error.code).toBe('rate_limited');
      expect(limited.headers.get('x-ratelimit-remaining')).toBe('0');

      const health = await first.request('/health');
      expect(health.status).toBe(200);
      expect((await health.json()).coordination).toMatchObject({ backend: 'redis', ok: true });
    }, 30_000);

    it('rejects an advance that another instance is running', async () => {
      const thisInstance = coordinator();
      const otherInstance = coordinator();
      const orchestrator = makeOrchestrator('locked', thisInstance);

      const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });

      // Another instance is in the middle of this run's stage.
      const theirs = await otherInstance.acquireRun(run.id);
      expect(theirs).not.toBeNull();

      const conflicted = await orchestrator
        .advance(run.id)
        .then(() => null)
        .catch((error: unknown) => error);
      expect(conflicted).toMatchObject({ status: 409 });
      expect((conflicted as Error).message).toMatch(/another API instance/i);

      // Nothing ran: no evidence was appended and the stage never recorded a
      // start. (Stage 0 reads `running` from the moment the run exists — that
      // is the pipeline's model of "this is the stage in progress".)
      const staged = await new FilesystemEvidenceStore(
        join(directory, 'locked', 'registry.ndjson'),
      ).list({ runId: run.id });
      expect(staged).toHaveLength(0);
      expect((await orchestrator.getRun(run.id)).stages[0]?.startedAt).toBeFalsy();

      await theirs?.release();
      // And once the other instance lets go, the same call proceeds.
      const advanced = await orchestrator.advance(run.id);
      expect(advanced.stage.id).toBe(0);
      expect(advanced.run.stages[0]?.status).toBe('gate_pending');

      await thisInstance.close?.();
      await otherInstance.close?.();
    }, 30_000);

    it('reports a Redis it cannot reach instead of counting locally', async () => {
      // A port nothing listens on: the honest answer is 503, never a local
      // counter that pretends the limit was shared. The short ready deadline
      // keeps the test at a few hundred milliseconds instead of four seconds.
      const dead = createRedisCoordinator({
        url: 'redis://127.0.0.1:1/0',
        readyTimeoutMs: 100,
      });
      await expect(dead.limit('k')).rejects.toBeInstanceOf(CoordinationUnavailableError);

      const probe = await dead.probe();
      expect(probe).toMatchObject({ backend: 'redis', ok: false });
      await dead.close?.();

      const unavailable = createRedisCoordinator({
        url: 'redis://127.0.0.1:1/0',
        readyTimeoutMs: 100,
      });
      const app = createApp({
        orchestrator: makeOrchestrator('down'),
        config: makeConfig(),
        capabilities: () => describeCapabilities(makeConfig()),
        coordinator: unavailable,
      });

      const refused = await app.request('/api/v1/runs');
      expect(refused.status).toBe(503);
      expect((await refused.json()).error.code).toBe('coordination_unavailable');

      const health = await app.request('/health');
      expect(health.status).toBe(503);
      expect((await health.json()).coordination.ok).toBe(false);
      await unavailable.close?.();
    }, 15_000);

    it('builds the same coordinator through the factory', async () => {
      const built = createCoordinator({
        backend: 'redis',
        redisUrl: fixture.url,
        limit: 1,
        windowMs: 60_000,
        lockTtlMs: 5_000,
      });
      expect(built.backend).toBe('redis');
      expect(await built.probe()).toMatchObject({ backend: 'redis', ok: true });
      expect(await built.limit(`${scope}:factory`)).toMatchObject({ allowed: true });
      await built.close?.();
    });
  },
);
