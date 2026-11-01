import { createFilesystemBlobStore } from './filesystem';
import type { BlobStore } from './ports';

export * from './ports';
export * from './filesystem';

export interface BlobSettings {
  /** `AEROSCRIBE_DATA_DIR`; the local adapter keeps blobs under it. */
  dataDir: string;
}

/**
 * The blob factory: one place decides where artefact bytes live.
 *
 * There is one adapter today, and it takes no configuration beyond the data
 * directory, so there is no `AEROSCRIBE_BLOBS` knob yet — a variable whose only
 * accepted value is the default is a variable that can only be set wrong. The
 * port exists anyway: the artefact route, the agents and the tests go through
 * it, so adding object storage later changes this function and nothing else.
 */
export function createBlobStore(settings: BlobSettings): BlobStore {
  return createFilesystemBlobStore({ dataDir: settings.dataDir });
}
