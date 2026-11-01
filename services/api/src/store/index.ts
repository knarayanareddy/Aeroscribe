import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FilesystemAuditStore } from './audit';
import { FilesystemEvidenceStore } from './evidence';
import { FilesystemRunStore } from './runs';
import { createPostgresStores } from './postgres';
import type { StoreBackend, StoreProbe, Stores } from './ports';

export * from './ports';
export * from './audit';
export * from './chain';
export * from './evidence';
export * from './runs';
export * from './postgres';

/**
 * The store factory.
 *
 * One place decides which adapter the process uses, so a route or a stage can
 * never reach around the ports to a concrete class. Adding a backend means
 * adding a case here and an adapter next to this file, not editing callers.
 */

export interface StoreSettings {
  /** `AEROSCRIBE_DATA_DIR`; ignored by backends that do not use files. */
  dataDir: string;
  /** `AEROSCRIBE_STORE`; validated by `loadConfig`. */
  store: StoreBackend;
  /**
   * `AEROSCRIBE_DATABASE_URL`. Required by `postgres` and rejected by
   * `filesystem` in `loadConfig`, so by the time a factory runs it is either
   * present or irrelevant.
   */
  databaseUrl?: string | null;
  /** Injected by tests so chains are reproducible. */
  clock?: () => Date;
  newId?: () => string;
}

/**
 * Prove the data directory can hold a write.
 *
 * A filesystem store that cannot create a file is not degraded, it is broken:
 * every run, evidence record and audit line would fail. The probe writes one
 * marker and removes it, which also creates the directory on first boot, so
 * `/health` answers the same question a real request would.
 */
async function probeFilesystem(dataDir: string): Promise<StoreProbe> {
  const marker = join(dataDir, `.health-${process.pid}.probe`);
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(marker, 'ok', 'utf8');
    await rm(marker, { force: true });
    return {
      backend: 'filesystem',
      ok: true,
      detail: `the data directory ${dataDir} is writable`,
    };
  } catch (error) {
    return {
      backend: 'filesystem',
      ok: false,
      detail: `the data directory ${dataDir} is not writable: ${(error as Error).message}`,
    };
  }
}

export function createStores(settings: StoreSettings): Stores {
  switch (settings.store) {
    case 'filesystem': {
      const { dataDir } = settings;
      return {
        backend: 'filesystem',
        runs: new FilesystemRunStore(join(dataDir, 'runs')),
        evidence: new FilesystemEvidenceStore(join(dataDir, 'registry.ndjson')),
        audit: new FilesystemAuditStore(join(dataDir, 'audit.ndjson')),
        probe: () => probeFilesystem(dataDir),
      };
    }
    case 'postgres': {
      if (!settings.databaseUrl) {
        // `loadConfig` refuses this combination at boot; the factory checks
        // again because a test or a script can call it directly.
        throw new Error('AEROSCRIBE_STORE=postgres needs AEROSCRIBE_DATABASE_URL.');
      }
      return createPostgresStores({
        databaseUrl: settings.databaseUrl,
        ...(settings.clock ? { clock: settings.clock } : {}),
        ...(settings.newId ? { newId: settings.newId } : {}),
      });
    }
    default: {
      // Exhaustive: adding a member to StoreBackend without a case is a compile
      // error here rather than a runtime surprise at boot.
      const unreachable: never = settings.store;
      throw new Error(`No adapter for AEROSCRIBE_STORE=${String(unreachable)}`);
    }
  }
}
