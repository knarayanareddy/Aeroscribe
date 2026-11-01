// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlobStore, createFilesystemBlobStore } from '../src/blob';
import { StoreUnavailableError } from '../src/errors';

/**
 * Content-addressed artefact storage.
 *
 * The properties worth testing are the ones the endpoint depends on: the
 * digest is the name, storing the same bytes twice writes once, and a file
 * whose content no longer matches its name is reported rather than silently
 * overwritten — because overwriting it would make the evidence chain's record
 * point at a digest that no longer describes anything.
 */

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-blobs-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const digestOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('filesystem blob store', () => {
  it('stores bytes under their digest and reads them back unchanged', async () => {
    const blobs = createFilesystemBlobStore({ dataDir: directory });
    const content = Buffer.from('mesh levels\n1 2 3\n', 'utf8');

    const ref = await blobs.put(content, 'text/csv');
    expect(ref).toEqual({
      sha256: digestOf(content),
      bytes: content.length,
      mediaType: 'text/csv',
    });

    const read = await blobs.get(ref.sha256);
    expect(Buffer.from(read!).equals(content)).toBe(true);

    // The layout is the digest split into a fan-out directory and the rest.
    const stored = await readFile(
      join(directory, 'blobs', 'sha256', ref.sha256.slice(0, 2), ref.sha256.slice(2)),
    );
    expect(stored.equals(content)).toBe(true);
  });

  it('is idempotent: the same bytes twice write one object', async () => {
    const blobs = createFilesystemBlobStore({ dataDir: directory });
    const content = Buffer.from('same', 'utf8');

    const first = await blobs.put(content, 'text/plain');
    const second = await blobs.put(content, 'text/plain');
    expect(second).toEqual(first);

    const fanOut = await readdir(join(directory, 'blobs', 'sha256'));
    // One directory for the prefix, and no second copy anywhere.
    const files = await Promise.all(
      fanOut.map(async (entry) => {
        const path = join(directory, 'blobs', 'sha256', entry);
        const stats = await readdir(path, { withFileTypes: true });
        return stats.filter((item) => item.isFile() && !item.name.endsWith('.media-type')).length;
      }),
    );
    expect(files.reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  it('refuses to overwrite a digest whose content changed on disk', async () => {
    const blobs = createFilesystemBlobStore({ dataDir: directory });
    const content = Buffer.from('original', 'utf8');
    const ref = await blobs.put(content, 'text/plain');

    // Somebody (or a bad restore) rewrote the object under its digest.
    const path = join(directory, 'blobs', 'sha256', ref.sha256.slice(0, 2), ref.sha256.slice(2));
    await writeFile(path, 'tampered');

    await expect(blobs.put(content, 'text/plain')).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('returns null for an object that was never stored, rather than throwing', async () => {
    const blobs = createFilesystemBlobStore({ dataDir: directory });
    // "The record is older than the store" is a normal state; only an I/O
    // failure is an outage.
    expect(await blobs.get('0'.repeat(64))).toBeNull();
  });

  it('probes by writing, so a read-only volume is reported as unhealthy', async () => {
    const blobs = createFilesystemBlobStore({ dataDir: directory });
    expect(await blobs.probe()).toMatchObject({ backend: 'filesystem', ok: true });
    expect((await blobs.probe()).detail).toContain(join(directory, 'blobs'));
  });

  it('is what the factory returns, so callers never pick an adapter', async () => {
    const blobs = createBlobStore({ dataDir: directory });
    expect(blobs.backend).toBe('filesystem');
    const ref = await blobs.put(Buffer.from('x'), 'text/plain');
    expect(ref.bytes).toBe(1);
  });
});
