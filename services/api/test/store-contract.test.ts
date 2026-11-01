// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRun } from '@aeroscribe/pipeline';
import type { EvidenceRecord } from '@aeroscribe/contract';
import { createStores, type Stores } from '../src/store';
import type { Pool } from 'pg';
import { databaseNameOf, startPostgres, type PostgresFixture } from './support/postgres';

/**
 * One suite, every backend.
 *
 * The point of `store/ports.ts` is that the orchestrator cannot tell which
 * adapter it was given, so the tests must not be able to either: every scenario
 * below runs through the ports only. A new adapter is added by writing a
 * harness and appending it to `HARNESSES` — the scenarios themselves do not
 * change, and the one thing an adapter may not do (silently behave differently)
 * becomes a failing test rather than a review note.
 *
 * A harness states what it cannot do. The filesystem adapter is single-writer
 * by construction, so `multipleWriters: false` skips the cross-instance test;
 * the skip is deliberate and named, not an accident of a missing fixture.
 */

interface Harness {
  /** Backend name, used in the test title and asserted on the probe. */
  name: 'filesystem' | 'postgres';
  /** Whether two independent instances may write to the same store. */
  multipleWriters: boolean;
  /**
   * Open a handle on a fresh, empty store.
   *
   * An adapter that supports multiple writers must map `sibling()` onto the
   * same data as this handle, because that is what the cross-instance scenario
   * means: two processes, one chain.
   */
  open(): Promise<Stores>;
  /** A second handle on the same data, for the multi-writer scenario. */
  sibling?(stores: Stores): Promise<Stores>;
  /** Break the chain the way somebody with database or filesystem access would. */
  tamper(stores: Stores, how: 'payload' | 'delete' | 'reorder'): Promise<void>;
  /** Free whatever `open` allocated (a directory, a database, …). */
  dispose(stores: Stores): Promise<void>;
}

const temporaryDirectories: string[] = [];

async function filesystemDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aeroscribe-store-contract-'));
  temporaryDirectories.push(directory);
  return directory;
}

const filesystem: Harness = {
  name: 'filesystem',
  multipleWriters: false,
  async open() {
    const directory = await filesystemDirectory();
    return createStores({ dataDir: directory, store: 'filesystem' });
  },
  async tamper(stores, how) {
    // The registry file is the filesystem adapter's business, and this is the
    // one place in the suite that knows it: every other scenario goes through
    // the ports.
    const path = (stores.evidence as unknown as { filePath: string }).filePath;
    const records = (await readFile(path, 'utf8'))
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as EvidenceRecord);

    if (how === 'payload') {
      const [first] = records;
      if (!first) throw new Error('tamper: no records');
      // A payload edit changes what a reader would see but leaves every hash
      // in place — exactly the edit the chain exists to catch.
      records[0] = { ...first, payload: { ...(first.payload as object), tampered: true } };
    } else if (how === 'delete') {
      records.splice(1, 1);
    } else {
      const [first, second] = records;
      if (!first || !second) throw new Error('tamper: need two records');
      records[0] = second;
      records[1] = first;
    }

    await writeFile(
      path,
      records.map((record) => JSON.stringify(record)).join('\n') + '\n',
      'utf8',
    );
  },
  async dispose(stores) {
    const path = (stores.evidence as unknown as { filePath: string }).filePath;
    await rm(dirname(path), { recursive: true, force: true });
  },
};

let postgres: PostgresFixture | undefined;
const postgresDatabases: string[] = [];

/**
 * The Postgres harness.
 *
 * Tampering goes through the trigger's own escape hatch — `DISABLE TRIGGER` —
 * because with the trigger armed the database refuses the edit outright
 * (`postgres.test.ts` asserts that separately). The point here is the second,
 * independent mechanism: even with the table guard switched off, the hash chain
 * still reports where history was rewritten.
 */
const postgresHarness: Harness = {
  name: 'postgres',
  multipleWriters: true,
  async open() {
    if (!postgres) throw new Error('the Postgres fixture did not start');
    const url = await postgres.createDatabase();
    postgresDatabases.push(databaseNameOf(url));
    return createStores({
      dataDir: await filesystemDirectory(),
      store: 'postgres',
      databaseUrl: url,
    });
  },
  async sibling(stores) {
    const url = (stores.evidence as unknown as { databaseUrl: string }).databaseUrl;
    return createStores({
      dataDir: await filesystemDirectory(),
      store: 'postgres',
      databaseUrl: url,
    });
  },
  async tamper(stores, how) {
    // `createStores` returns the port surface; the pool is reachable through the
    // adapter underneath it, which is the only way to run raw SQL in a test.
    const client = await (stores.evidence as unknown as { pool: Pool }).pool.connect();
    try {
      await client.query('ALTER TABLE evidence DISABLE TRIGGER USER');
      if (how === 'payload') {
        await client.query(
          `UPDATE evidence SET payload = '{"tampered":true}'::jsonb WHERE seq = 0`,
        );
      } else if (how === 'delete') {
        await client.query('DELETE FROM evidence WHERE seq = 1');
      } else {
        // Swap two links. The primary key forbids a temporary duplicate, so the
        // first row parks on a free sequence number for the duration.
        await client.query('UPDATE evidence SET seq = 1000 WHERE seq = 0');
        await client.query('UPDATE evidence SET seq = 0 WHERE seq = 1');
        await client.query('UPDATE evidence SET seq = 1 WHERE seq = 1000');
      }
      await client.query('ALTER TABLE evidence ENABLE TRIGGER USER');
    } finally {
      client.release();
    }
  },
  async dispose(stores) {
    await stores.close?.();
  },
};

const HARNESSES: Harness[] = [filesystem, postgresHarness];

beforeAll(async () => {
  postgres = await startPostgres();
}, 120_000);

afterAll(async () => {
  for (const name of postgresDatabases.splice(0)) {
    await postgres?.dropDatabase(name).catch(() => undefined);
  }
  await postgres?.stop();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.each(HARNESSES)('store contract: $name', (harness) => {
  it('round-trips a run', async () => {
    const stores = await harness.open();
    const run = createRun({ id: 'run-1', topic: 'transonic wing', journal: 'AIAA Journal' });

    expect(await stores.runs.get('run-1')).toBeNull();
    await stores.runs.save(run);
    expect(await stores.runs.get('run-1')).toEqual(run);
    await harness.dispose(stores);
  });

  it('lists runs newest first, with the id breaking a timestamp tie', async () => {
    const stores = await harness.open();
    const now = new Date('2026-01-01T00:00:00.000Z');
    for (const [id, offset] of [
      ['run-a', 0],
      ['run-b', 0],
      ['run-c', 60_000],
    ] as const) {
      await stores.runs.save(
        createRun({
          id,
          topic: `topic ${id}`,
          journal: 'AIAA Journal',
          now: new Date(now.getTime() + offset),
        }),
      );
    }

    // Newest first; `run-a` and `run-b` share a millisecond and fall back to the
    // id, so the order does not depend on what the backend happens to return.
    expect((await stores.runs.list()).map((run) => run.id)).toEqual(['run-c', 'run-b', 'run-a']);
    await harness.dispose(stores);
  });

  it('keeps per-run options beside the run and drops both on remove', async () => {
    const stores = await harness.open();
    const run = createRun({ id: 'run-1', topic: 'transonic wing', journal: 'AIAA Journal' });
    await stores.runs.save(run);
    await stores.runs.saveOptions('run-1', { paperLimit: 3, verifyTop: 1 });

    expect(await stores.runs.getOptions('run-1')).toEqual({ paperLimit: 3, verifyTop: 1 });
    expect(await stores.runs.getOptions('run-2')).toBeNull();

    await stores.runs.remove('run-1');
    expect(await stores.runs.get('run-1')).toBeNull();
    expect(await stores.runs.getOptions('run-1')).toBeNull();
    await harness.dispose(stores);
  });

  it('chains appends, filters them and verifies', async () => {
    const stores = await harness.open();
    const first = await stores.evidence.append({
      kind: 'stage-output',
      runId: 'run-1',
      stageId: 0,
      label: 'stage 0',
      payload: { stage: 'topic-intelligence', schemaVersion: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const second = await stores.evidence.append({
      kind: 'cfd-run',
      runId: 'run-1',
      stageId: 4,
      label: 'stage 4',
      payload: { stage: 'evidence-generation', schemaVersion: 1 },
      createdAt: '2026-01-01T00:00:01.000Z',
    });
    const third = await stores.evidence.append({
      kind: 'manuscript',
      runId: 'run-2',
      stageId: 5,
      label: 'stage 5',
      payload: { stage: 'paper-synthesis', schemaVersion: 1 },
      createdAt: '2026-01-01T00:00:02.000Z',
    });

    expect([first.seq, second.seq, third.seq]).toEqual([0, 1, 2]);
    expect(second.prevHash).toBe(first.hash);
    expect(third.prevHash).toBe(second.hash);
    // The timestamp is inside every hash, so a backend that rounds it would
    // make the chain unverifiable. Assert the exact value came back.
    expect(await stores.evidence.get(0)).toMatchObject({ createdAt: '2026-01-01T00:00:00.000Z' });

    expect((await stores.evidence.list({ runId: 'run-1' })).map((r) => r.seq)).toEqual([0, 1]);
    expect((await stores.evidence.list({ kind: 'cfd-run' })).map((r) => r.seq)).toEqual([1]);
    expect((await stores.evidence.get(2))?.label).toBe('stage 5');
    expect(await stores.evidence.get(99)).toBeNull();
    expect((await stores.evidence.latest('run-1', 'stage-output'))?.seq).toBe(0);
    expect(await stores.evidence.latest('run-1', 'manuscript')).toBeNull();

    const verification = await stores.evidence.verify();
    expect(verification).toMatchObject({ valid: true, records: 3, head: third.hash });
    await harness.dispose(stores);
  });

  it('serialises concurrent appends', async () => {
    const stores = await harness.open();
    // A stage appends while a re-check appends: the port promises one chain,
    // not one caller at a time.
    const records = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        stores.evidence.append({
          kind: 'stage-output',
          runId: 'run-1',
          label: `append ${index}`,
          payload: { index },
        }),
      ),
    );

    expect(records.map((record) => record.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, index) => index),
    );
    expect(new Set(records.map((record) => record.hash)).size).toBe(25);
    expect(await stores.evidence.verify()).toMatchObject({ valid: true, records: 25 });
    await harness.dispose(stores);
  });

  it.skipIf(!harness.multipleWriters)(
    'keeps one chain when two instances write to the same store',
    async () => {
      const stores = await harness.open();
      const other = await harness.sibling!(stores);

      // Two independent connections — the same situation the advisory lock
      // exists for, whether or not they are in one process.
      await Promise.all(
        Array.from({ length: 20 }, async (_, index) => {
          const target = index % 2 === 0 ? stores : other;
          await target.evidence.append({
            kind: 'stage-output',
            runId: 'run-1',
            label: `writer ${index % 2} append ${index}`,
            payload: { index },
          });
        }),
      );

      expect(await stores.evidence.verify()).toMatchObject({ valid: true, records: 20 });
      await other.close?.();
      await harness.dispose(stores);
    },
  );

  it('detects an edited payload', async () => {
    const stores = await harness.open();
    await seed(stores);
    await harness.tamper(stores, 'payload');

    const verification = await stores.evidence.verify();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(0);
    expect(verification.reason).toMatch(/payload/);
    await harness.dispose(stores);
  });

  it('detects a deleted record', async () => {
    const stores = await harness.open();
    await seed(stores);
    await harness.tamper(stores, 'delete');

    const verification = await stores.evidence.verify();
    expect(verification.valid).toBe(false);
    // Removing the middle link leaves a record whose predecessor is no longer
    // the one it chained to.
    expect(verification.brokenAt).toBe(1);
    await harness.dispose(stores);
  });

  it('detects reordered records', async () => {
    const stores = await harness.open();
    await seed(stores);
    await harness.tamper(stores, 'reorder');

    const verification = await stores.evidence.verify();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(0);
    await harness.dispose(stores);
  });

  it('appends and reads the audit trail', async () => {
    const stores = await harness.open();
    await stores.audit.record({
      action: 'run.created',
      runId: 'run-1',
      actor: 'tester',
      detail: {},
    });
    await stores.audit.record({
      action: 'gate.approved',
      runId: 'run-1',
      actor: 'reviewer',
      detail: {},
    });
    await stores.audit.record({
      action: 'run.created',
      runId: 'run-2',
      actor: 'tester',
      detail: {},
    });

    const all = await stores.audit.read();
    expect(all.entries.map((entry) => entry.action)).toEqual([
      'run.created',
      'gate.approved',
      'run.created',
    ]);
    expect(all.entries.every((entry) => Number.isFinite(Date.parse(entry.at)))).toBe(true);

    expect((await stores.audit.read({ runId: 'run-2' })).entries).toHaveLength(1);
    expect((await stores.audit.read({ action: 'run.created' })).entries).toHaveLength(2);
    expect((await stores.audit.read({ limit: 1 })).entries.map((entry) => entry.runId)).toEqual([
      'run-2',
    ]);
    await harness.dispose(stores);
  });

  it('reports whether the backend can be written to', async () => {
    const stores = await harness.open();
    expect(await stores.probe()).toMatchObject({ backend: harness.name, ok: true });
    await harness.dispose(stores);
  });
});

describe('the filesystem probe', () => {
  it('reports a data directory it cannot write to', async () => {
    // A path nested under a regular file cannot be created. The probe must say
    // so: the alternative is a healthy-looking process that fails every write.
    const directory = await filesystemDirectory();
    const blocker = join(directory, 'blocker');
    await writeFile(blocker, 'not a directory', 'utf8');

    const stores = createStores({ dataDir: join(blocker, 'data'), store: 'filesystem' });
    const probe = await stores.probe();
    expect(probe.backend).toBe('filesystem');
    expect(probe.ok).toBe(false);
    expect(probe.detail).toMatch(/not writable/);
  });
});

/** Three records, which every tamper scenario needs. */
async function seed(stores: Stores): Promise<void> {
  const kinds = ['stage-output', 'cfd-run', 'manuscript'] as const;
  for (const [index, kind] of kinds.entries()) {
    await stores.evidence.append({
      kind,
      runId: 'run-1',
      label: `record ${index}`,
      payload: { index },
    });
  }
}
