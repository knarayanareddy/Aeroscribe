// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvidenceRegistry } from '../src/store/registry';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-registry-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function registry(path = join(directory, 'registry.ndjson')) {
  let counter = 0;
  return new EvidenceRegistry(path, {
    clock: () => new Date('2026-10-30T12:00:00Z'),
    newId: () => `id-${(counter += 1)}`,
  });
}

describe('EvidenceRegistry', () => {
  it('chains records and verifies cleanly', async () => {
    const store = registry();
    const first = await store.append({
      kind: 'cfd-run',
      runId: 'run-1',
      label: 'first',
      payload: { value: 0.31 },
    });
    const second = await store.append({
      kind: 'manuscript',
      runId: 'run-1',
      label: 'second',
      payload: { words: 900 },
    });

    expect(first.seq).toBe(0);
    expect(first.prevHash).toBe('0'.repeat(64));
    expect(second.prevHash).toBe(first.hash);

    const verification = await store.verify();
    expect(verification).toMatchObject({ valid: true, records: 2, head: second.hash });
  });

  it('persists across instances', async () => {
    const path = join(directory, 'registry.ndjson');
    await registry(path).append({ kind: 'cfd-run', runId: 'r', label: 'x', payload: { value: 1 } });

    const reloaded = registry(path);
    await reloaded.load();
    expect(reloaded.size).toBe(1);
    expect((await reloaded.verify()).valid).toBe(true);
  });

  it('detects an edited payload', async () => {
    const path = join(directory, 'registry.ndjson');
    const store = registry(path);
    await store.append({ kind: 'cfd-run', runId: 'r', label: 'x', payload: { value: 1 } });
    await store.append({ kind: 'manuscript', runId: 'r', label: 'y', payload: { value: 2 } });

    const lines = (await readFile(path, 'utf8')).trim().split('\n');
    const tampered = JSON.parse(lines[1]!) as { payload: { value: number } };
    tampered.payload.value = 3;
    lines[1] = JSON.stringify(tampered);
    await writeFile(path, `${lines.join('\n')}\n`, 'utf8');

    const verification = await registry(path).verify();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
    expect(verification.reason).toMatch(/payload/);
  });

  it('detects a deleted record', async () => {
    const path = join(directory, 'registry.ndjson');
    const store = registry(path);
    await store.append({ kind: 'cfd-run', runId: 'r', label: 'a', payload: { value: 1 } });
    await store.append({ kind: 'manuscript', runId: 'r', label: 'b', payload: { value: 2 } });
    await store.append({ kind: 'review-report', runId: 'r', label: 'c', payload: { value: 3 } });

    const lines = (await readFile(path, 'utf8')).trim().split('\n');
    await writeFile(path, `${lines[0]}\n${lines[2]}\n`, 'utf8');

    const verification = await registry(path).verify();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
  });

  it('detects an edited metadata field', async () => {
    const path = join(directory, 'registry.ndjson');
    await registry(path).append({ kind: 'cfd-run', runId: 'r', label: 'x', payload: { value: 1 } });

    const record = JSON.parse((await readFile(path, 'utf8')).trim()) as { label: string };
    record.label = 'edited';
    await writeFile(path, `${JSON.stringify(record)}\n`, 'utf8');

    const verification = await registry(path).verify();
    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/hash/);
  });

  it('serialises concurrent appends so seq values never collide', async () => {
    const store = registry();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.append({
          kind: 'stage-output',
          runId: 'r',
          label: `item ${index}`,
          payload: { index },
        }),
      ),
    );

    const records = await store.list();
    expect(records.map((record) => record.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect((await store.verify()).valid).toBe(true);
  });

  it('filters by run and kind, and exposes the latest record of a kind', async () => {
    const store = registry();
    await store.append({ kind: 'cfd-run', runId: 'a', label: 'a1', payload: {} });
    await store.append({ kind: 'cfd-run', runId: 'b', label: 'b1', payload: {} });
    await store.append({ kind: 'manuscript', runId: 'a', label: 'a2', payload: {} });

    expect((await store.list({ runId: 'a' })).map((r) => r.label)).toEqual(['a1', 'a2']);
    expect((await store.list({ kind: 'cfd-run' })).map((r) => r.label)).toEqual(['a1', 'b1']);
    expect((await store.latest('a', 'manuscript'))?.label).toBe('a2');
    expect(await store.latest('b', 'manuscript')).toBeNull();
  });

  it('reports an empty registry as valid with the genesis head', async () => {
    const verification = await registry(join(directory, 'nothing.ndjson')).verify();
    expect(verification).toMatchObject({ valid: true, records: 0, head: '0'.repeat(64) });
  });
});
