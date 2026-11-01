// @vitest-environment node
import type { Pool as PgPool } from 'pg';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRun } from '@aeroscribe/pipeline';
import type { Config } from '../src/config';
import { describeCapabilities, loadConfig } from '../src/config';
import { CfdService } from '../src/cfd';
import { StoreUnavailableError } from '../src/errors';
import { createApp } from '../src/http/app';
import { buildServer, startServer } from '../src/index';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import {
  createPool,
  createStores,
  importDataDir,
  redactDatabaseUrl,
  runMigrations,
  type Stores,
} from '../src/store';
import { databaseNameOf, startPostgres, type PostgresFixture } from './support/postgres';

/**
 * What is specific to the Postgres adapter.
 *
 * The shared `store-contract.test.ts` proves both backends behave the same.
 * This file proves the guarantees only a database can give: a trigger that
 * refuses to rewrite history, a unique sequence that survives two concurrent
 * writers, migrations that are safe to re-run, and an import that copies a
 * chain without recomputing a single digest.
 *
 * Everything here runs against a real server (embedded binaries or an
 * externally supplied `AEROSCRIBE_TEST_DATABASE_URL`), because the properties
 * under test — transactional locking, triggers, `jsonb` round-trips — are
 * exactly the ones a mock would get wrong.
 */

let fixture: PostgresFixture;
let directory: string;
const databases: string[] = [];

async function freshStores(): Promise<{ stores: Stores; url: string }> {
  const url = await fixture.createDatabase();
  databases.push(databaseNameOf(url));
  const stores = createStores({ dataDir: directory, store: 'postgres', databaseUrl: url });
  return { stores, url };
}

beforeAll(async () => {
  fixture = await startPostgres();
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-postgres-'));
}, 120_000);

afterAll(async () => {
  for (const name of databases.splice(0)) {
    await fixture.dropDatabase(name).catch(() => undefined);
  }
  await fixture.stop();
  await rm(directory, { recursive: true, force: true });
});

describe('append-only, enforced by the database', () => {
  it('refuses to update a record', async () => {
    const { stores } = await freshStores();
    await stores.evidence.append({
      kind: 'stage-output',
      runId: 'run-1',
      label: 'one',
      payload: { a: 1 },
    });

    const client = await (stores.evidence as unknown as { pool: PgPool }).pool.connect();
    try {
      await expect(
        client.query(`UPDATE evidence SET payload = '{"a":2}'::jsonb WHERE seq = 0`),
      ).rejects.toThrow(/append-only/);
      // The row is unchanged.
      expect((await stores.evidence.get(0))?.payload).toEqual({ a: 1 });
    } finally {
      client.release();
      await stores.close?.();
    }
  });

  it('refuses to delete a record, one or all', async () => {
    const { stores } = await freshStores();
    await stores.evidence.append({
      kind: 'stage-output',
      runId: 'run-1',
      label: 'one',
      payload: { a: 1 },
    });

    const client = await (stores.evidence as unknown as { pool: PgPool }).pool.connect();
    try {
      await expect(client.query('DELETE FROM evidence WHERE seq = 0')).rejects.toThrow(
        /append-only/,
      );
      // TRUNCATE bypasses row triggers, so it has its own statement-level guard.
      await expect(client.query('TRUNCATE evidence')).rejects.toThrow(/append-only/);
      expect((await stores.evidence.list()).length).toBe(1);
    } finally {
      client.release();
      await stores.close?.();
    }
  });
});

describe('concurrency', () => {
  it('keeps one linear chain across two writers appending 50 records each', async () => {
    const { stores, url } = await freshStores();
    const other = createStores({ dataDir: directory, store: 'postgres', databaseUrl: url });

    // Two independent connections, appending at the same time: the advisory
    // lock is the only thing standing between this and a forked chain.
    await Promise.all(
      [stores, other].map(async (writer, writerIndex) => {
        await Promise.all(
          Array.from({ length: 50 }, (_, index) =>
            writer.evidence.append({
              kind: 'stage-output',
              runId: `run-${writerIndex}`,
              label: `writer ${writerIndex} record ${index}`,
              payload: { writerIndex, index },
            }),
          ),
        );
      }),
    );

    const records = await stores.evidence.list();
    expect(records).toHaveLength(100);
    expect(records.map((record) => record.seq)).toEqual(
      Array.from({ length: 100 }, (_, index) => index),
    );
    for (let index = 1; index < records.length; index += 1) {
      expect(records[index]?.prevHash).toBe(records[index - 1]?.hash);
    }
    expect(await stores.evidence.verify()).toMatchObject({ valid: true, records: 100 });

    // A second, independent reader sees the same chain — which is what
    // `db:verify` does from outside the application.
    expect(await other.evidence.verify()).toMatchObject({ valid: true, records: 100 });

    await other.close?.();
    await stores.close?.();
  }, 60_000);
});

describe('migrations', () => {
  it('is safe to run twice', async () => {
    const { stores } = await freshStores();
    const pool = (stores.evidence as unknown as { pool: PgPool }).pool;

    const second = await runMigrations(pool);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toContain('001_initial.sql');
    await stores.close?.();
  });

  it('records every applied migration', async () => {
    const { stores } = await freshStores();
    const pool = (stores.evidence as unknown as { pool: PgPool }).pool;
    const { rows } = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(rows.map((row) => row.version)).toEqual(['001_initial.sql']);
    await stores.close?.();
  });
});

describe('importing a filesystem deployment', () => {
  it('copies the chain verbatim and still verifies', async () => {
    const filesystem = await mkdtemp(join(tmpdir(), 'aeroscribe-import-source-'));
    const source = createStores({ dataDir: filesystem, store: 'filesystem' });

    const run = createRun({ id: 'run-1', topic: 'transonic wing', journal: 'AIAA Journal' });
    await source.runs.save(run);
    await source.runs.saveOptions('run-1', { paperLimit: 2 });
    await source.audit.record({
      action: 'run.created',
      runId: 'run-1',
      actor: 'importer',
      detail: {},
    });
    const kinds = ['stage-output', 'cfd-run', 'manuscript'] as const;
    for (const [index, kind] of kinds.entries()) {
      await source.evidence.append({
        kind,
        runId: 'run-1',
        label: `record ${index}`,
        payload: { index },
        // Millisecond precision, exactly as `Date#toISOString()` writes it: the
        // import must survive the round trip or every hash breaks.
        createdAt: `2026-01-01T00:00:0${index}.000Z`,
      });
    }
    const before = await source.evidence.list();

    const { stores } = await freshStores();
    const pool = (stores.evidence as unknown as { pool: PgPool }).pool;

    const result = await importDataDir(pool, filesystem);
    expect(result).toMatchObject({ evidence: 3, runs: 1, runOptions: 1, audit: 1 });
    expect(result.verification.valid).toBe(true);

    // Byte-for-byte the same chain: same ids, hashes, timestamps, payloads.
    expect(await stores.evidence.list()).toEqual(before);
    expect(await stores.runs.get('run-1')).toEqual(run);
    expect(await stores.runs.getOptions('run-1')).toEqual({ paperLimit: 2 });

    await stores.close?.();
    await rm(filesystem, { recursive: true, force: true });
  });

  it('completes on a pool of one connection, the way db:import runs', async () => {
    // Regression: the verification read used to go back through the pool while
    // the import still held the only client, so the command waited five
    // seconds and then failed with "timeout exceeded when trying to connect".
    // A default-sized pool hid it from every unit test.
    const filesystem = await mkdtemp(join(tmpdir(), 'aeroscribe-import-source-'));
    const source = createStores({ dataDir: filesystem, store: 'filesystem' });
    await source.evidence.append({
      kind: 'stage-output',
      runId: 'run-1',
      label: 'one',
      payload: { a: 1 },
    });

    const url = await fixture.createDatabase();
    databases.push(databaseNameOf(url));
    const pool = createPool({ databaseUrl: url, max: 1 });
    try {
      const result = await importDataDir(pool, filesystem);
      expect(result.verification).toMatchObject({ valid: true, records: 1 });
    } finally {
      await pool.end();
      await rm(filesystem, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses to import into a database that already has records', async () => {
    const filesystem = await mkdtemp(join(tmpdir(), 'aeroscribe-import-source-'));
    const source = createStores({ dataDir: filesystem, store: 'filesystem' });
    await source.evidence.append({
      kind: 'stage-output',
      runId: 'run-1',
      label: 'one',
      payload: { a: 1 },
    });

    const { stores } = await freshStores();
    await stores.evidence.append({
      kind: 'stage-output',
      runId: 'run-2',
      label: 'already here',
      payload: { b: 2 },
    });
    const pool = (stores.evidence as unknown as { pool: PgPool }).pool;

    await expect(importDataDir(pool, filesystem)).rejects.toThrow(/empty database/);
    await stores.close?.();
    await rm(filesystem, { recursive: true, force: true });
  });
});

describe('an unreachable database', () => {
  const UNREACHABLE = 'postgres://aeroscribe:secret@127.0.0.1:1/aeroscribe';

  it('reports itself unavailable instead of throwing from the probe', async () => {
    const stores = createStores({
      dataDir: directory,
      store: 'postgres',
      databaseUrl: UNREACHABLE,
    });
    const probe = await stores.probe();
    expect(probe.backend).toBe('postgres');
    expect(probe.ok).toBe(false);
    // The password must not appear anywhere in the report.
    expect(probe.detail).not.toContain('secret');
    await stores.close?.();
  });

  it('answers 503 on a write, and writes nothing to disk', async () => {
    // Acceptance § 8.3: with the database down, `/health` says unreachable,
    // writes return 503, and no file appears on disk — the fallback this whole
    // workstream exists to prevent.
    const dataDir = await mkdtemp(join(tmpdir(), 'aeroscribe-no-fallback-'));
    const stores = createStores({ dataDir, store: 'postgres', databaseUrl: UNREACHABLE });

    const config: Config = {
      host: '127.0.0.1',
      port: 0,
      dataDir,
      apiKey: '',
      contactEmail: '',
      offline: true,
      su2Binary: null,
      latexBinary: null,
      latexTimeoutMs: 5_000,
      corsOrigins: ['http://localhost:5174'],
      upstreamTimeoutMs: 5_000,
      retryBaseDelayMs: 1,
      doiMaxAgeDays: 30,
      store: 'postgres',
      databaseUrl: UNREACHABLE,
      logLevel: 'silent',
      version: 'test',
      commit: 'test',
    };

    const orchestrator = new Orchestrator({
      runs: stores.runs,
      registry: stores.evidence,
      audit: stores.audit,
      literature: new LiteratureService({ offline: true, providers: [] }),
      cfd: new CfdService({
        su2: { available: false, binary: null },
        workDir: join(dataDir, 'cfd'),
      }),
      newRunId: () => 'run-1',
    });
    const app = createApp({
      orchestrator,
      config,
      capabilities: () => describeCapabilities(config),
      stores,
    });

    const health = await app.request('/health');
    expect(health.status).toBe(503);
    expect((await health.json()).store).toMatchObject({ backend: 'postgres', ok: false });

    const created = await app.request('/api/v1/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'transonic wing' }),
    });
    expect(created.status).toBe(503);
    expect((await created.json()).error.code).toBe('store_unavailable');

    // The whole point: no JSON file appeared where the old adapter would have
    // written one.
    expect(await readdir(dataDir)).toEqual([]);
    await stores.close?.();
    await rm(dataDir, { recursive: true, force: true });
  }, 30_000);

  it('throws a 503 error, never an empty result', async () => {
    // An empty evidence list would look exactly like a run with no records, and
    // a reviewer would believe it.
    const stores = createStores({
      dataDir: directory,
      store: 'postgres',
      databaseUrl: UNREACHABLE,
    });
    await expect(stores.evidence.list({ runId: 'run-1' })).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
    await expect(
      stores.evidence.append({
        kind: 'stage-output',
        runId: 'run-1',
        label: 'x',
        payload: {},
      }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
    await stores.close?.();
  }, 30_000);
});

describe('shutdown', () => {
  it('drains the connection pool after the listener closes', async () => {
    // A pool left open turns a clean exit into a 30-second hang, and a client
    // released mid-transaction leaves the server to time it out.
    const dataDir = await mkdtemp(join(tmpdir(), 'aeroscribe-shutdown-'));
    const built = await buildServer({
      AEROSCRIBE_DATA_DIR: dataDir,
      AEROSCRIBE_STORE: 'postgres',
      AEROSCRIBE_DATABASE_URL: 'postgres://aeroscribe:secret@127.0.0.1:1/aeroscribe',
      AEROSCRIBE_OFFLINE: 'true',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv);

    let drained = false;
    const close = built.stores.close;
    built.stores.close = async () => {
      drained = true;
      await close?.();
    };

    const handlers = new Map<string, () => void>();
    const once = vi.spyOn(process, 'once').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers.set(event, handler);
      return process;
    }) as typeof process.once);

    try {
      startServer(built, {
        // Bun hands the listener the address it bound; the stub does the same,
        // because `startServer` logs from it and a bare `listener()` throws
        // inside the microtask — a failure that shows up as an unhandled error
        // rather than a failed assertion.
        serve: ((options: { fetch: unknown }, listener: (info: AddressInfo) => void) => {
          expect(typeof options.fetch).toBe('function');
          queueMicrotask(() => listener({ address: '127.0.0.1', port: 0 }));
          return { close: (cb?: () => void) => cb?.() };
        }) as unknown as typeof serve,
        log: () => undefined,
        exit: () => undefined,
      });

      handlers.get('SIGTERM')?.();
      await vi.waitFor(() => expect(drained).toBe(true));
    } finally {
      once.mockRestore();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe('connection strings', () => {
  it('never exposes the password', () => {
    expect(redactDatabaseUrl('postgres://user:hunter2@db.example.org:5432/aeroscribe')).toBe(
      'postgres://user@db.example.org:5432/aeroscribe',
    );
    expect(redactDatabaseUrl('not a url')).not.toContain('not a url');
  });

  it('is what capabilities report', async () => {
    const config = loadConfig({
      AEROSCRIBE_STORE: 'postgres',
      AEROSCRIBE_DATABASE_URL: 'postgres://user:hunter2@db.example.org:5432/aeroscribe',
    });
    const capabilities = await describeCapabilities(config);
    expect(capabilities.storage.backend).toBe('postgres');
    expect(capabilities.storage.database).toBe('postgres://user@db.example.org:5432/aeroscribe');
    expect(JSON.stringify(capabilities)).not.toContain('hunter2');
    // The filesystem paths are empty: there is no directory behind this.
    expect(capabilities.storage.runsDir).toBe('');
  });
});
