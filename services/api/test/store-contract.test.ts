// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRun } from '@aeroscribe/pipeline';
import type { EvidenceRecord } from '@aeroscribe/contract';
import { createStores, type Stores } from '../src/store';

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
 * by construction, so `multipleWriters: false` skips the cross-instance test and
 * the suite asserts the skip reason is deliberate rather than forgotten.
 */

interface Harness {
  /** Backend name, used in the test title. */
  name: string;
  /** Whether two independent instances may write to the same store. */
  multipleWriters: boolean;
  /**
   * Open a handle on the *same configured* store, reset to empty.
   *
   * An adapter that supports multiple writers must map every handle onto the
   * same data (one database, one table set), because that is what the
   * cross-instance scenario means: two processes, one chain.
   */
  open(): Promise<Stores>;
  /** Break the chain the way an operator with a text editor would. */
  tamper(stores: Stores, how: 'payload' | 'delete' | 'reorder'): Promise<void>;
  /** Free whatever `open` allocated (a directory, a schema, …). */
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
    const lines = (await readFile(path, 'utf8'))
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const records = lines.map((line) => JSON.parse(line) as EvidenceRecord);

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

const HARNESSES: Harness[] = [filesystem];

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

  it('serialises concurrent appends within one instance', async () => {
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
      const other = await harness.open();

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

      // Both instances must agree on the chain, and it must still verify: that
      // is what a unique `seq` plus a lock buys over an append to a file.
      expect(await stores.evidence.verify()).toMatchObject({ valid: true, records: 20 });
      await harness.dispose(other);
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
  for (const [index, kind] of ['stage-output', 'cfd-run', 'manuscript'] as const) {
    await stores.evidence.append({
      kind,
      runId: 'run-1',
      label: `record ${index}`,
      payload: { index },
    });
  }
}
