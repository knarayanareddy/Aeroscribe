import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { StoreUnavailableError } from '../errors';
import type { BlobProbe, BlobRef, BlobStore } from './ports';

/**
 * Content-addressed blobs on the local disk.
 *
 * Layout: `<dataDir>/blobs/sha256/<first two hex>/<digest>`. The two-character
 * fan-out keeps any one directory from holding every file if a deployment
 * stores tens of thousands of artefacts; the digest is the whole name, so a
 * reader does not have to look anything up to know what it should get.
 *
 * Writes are atomic (temporary file + `rename`), so a crash mid-write leaves the
 * old object (or nothing), never a half file under a digest that claims
 * otherwise. A digest that is already present is never rewritten: if the bytes
 * on disk do not match their name, that is corruption worth reporting, not
 * something to paper over with a fresh copy.
 */
export interface FilesystemBlobStoreOptions {
  /** `AEROSCRIBE_DATA_DIR`; blobs live under `<dataDir>/blobs`. */
  dataDir: string;
}

const MEDIA_TYPE_SIDECAR = '.media-type';

export function createFilesystemBlobStore(options: FilesystemBlobStoreOptions): BlobStore {
  const root = join(options.dataDir, 'blobs', 'sha256');

  const pathOf = (sha256: string): string => join(root, sha256.slice(0, 2), sha256.slice(2));

  return {
    backend: 'filesystem',

    async put(content: Uint8Array, mediaType: string): Promise<BlobRef> {
      const digest = createHash('sha256').update(content).digest('hex');
      const path = pathOf(digest);
      const ref: BlobRef = { sha256: digest, bytes: content.length, mediaType };

      try {
        const existing = await readFile(path).catch(() => null);
        if (existing !== null) {
          if (existing.length !== content.length || !existing.equals(Buffer.from(content))) {
            throw new StoreUnavailableError(
              'filesystem',
              `blob ${digest} is already stored with different bytes; refusing to overwrite it`,
            );
          }
          return ref;
        }

        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temporary, content);
        try {
          await rename(temporary, path);
        } catch (error) {
          await rm(temporary, { force: true });
          throw error;
        }
        // The media type is metadata, not identity: two records may describe the
        // same bytes differently, and a reader falls back to the record's value.
        await writeFile(`${path}${MEDIA_TYPE_SIDECAR}`, mediaType, 'utf8').catch(() => undefined);
        return ref;
      } catch (error) {
        if (error instanceof StoreUnavailableError) throw error;
        throw new StoreUnavailableError(
          'filesystem',
          `could not store blob in ${root}: ${(error as Error).message}`,
        );
      }
    },

    async get(sha256: string): Promise<Uint8Array | null> {
      try {
        const bytes = await readFile(pathOf(sha256));
        return new Uint8Array(bytes);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return null;
        throw new StoreUnavailableError(
          'filesystem',
          `could not read blob ${sha256}: ${(error as Error).message}`,
        );
      }
    },

    async probe(): Promise<BlobProbe> {
      const marker = join(root, `.probe-${process.pid}`);
      try {
        await mkdir(root, { recursive: true });
        await writeFile(marker, 'ok', 'utf8');
        await rm(marker, { force: true });
        return { backend: 'filesystem', ok: true, detail: `artefact blobs live in ${root}` };
      } catch (error) {
        return {
          backend: 'filesystem',
          ok: false,
          detail: `the blob directory ${root} is not writable: ${(error as Error).message}`,
        };
      }
    },
  };
}
