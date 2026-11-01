import type { Pool } from 'pg';
import type { StoreProbe, Stores } from '../ports';
import { PostgresAuditStore } from './audit';
import { createPool, redactDatabaseUrl, storeError } from './client';
import { PostgresEvidenceStore } from './evidence';
import { PostgresRunStore } from './runs';

export * from './client';
export * from './import';
export * from './migrations';

/**
 * The Postgres adapter set.
 *
 * `probe()` runs a statement rather than reading a flag: a pool object exists
 * whether or not a server is listening, so only a round trip distinguishes "the
 * database is up" from "the process started and will fail on the first write".
 */

export interface PostgresStoresOptions {
  databaseUrl: string;
  /** Injected by tests so chains are reproducible. */
  clock?: () => Date;
  newId?: () => string;
  /** Injected by tests; production uses a fresh pool. */
  pool?: Pool;
}

export function createPostgresPool(options: PostgresStoresOptions): Pool {
  return options.pool ?? createPool({ databaseUrl: options.databaseUrl });
}

export function createPostgresStores(options: PostgresStoresOptions): Stores {
  const pool = createPostgresPool(options);

  return {
    backend: 'postgres',
    runs: new PostgresRunStore(pool, options.databaseUrl),
    evidence: new PostgresEvidenceStore(pool, options.databaseUrl, {
      ...(options.clock ? { clock: options.clock } : {}),
      ...(options.newId ? { newId: options.newId } : {}),
    }),
    audit: new PostgresAuditStore(pool, options.databaseUrl),
    async probe(): Promise<StoreProbe> {
      try {
        await pool.query('SELECT 1');
        return {
          backend: 'postgres',
          ok: true,
          detail: `${redactDatabaseUrl(options.databaseUrl)} answered SELECT 1`,
        };
      } catch (error) {
        const wrapped = storeError(error, options.databaseUrl);
        if (wrapped === error) {
          return {
            backend: 'postgres',
            ok: false,
            detail: `${redactDatabaseUrl(options.databaseUrl)} failed: ${(error as Error).message}`,
          };
        }
        return { backend: 'postgres', ok: false, detail: (wrapped as Error).message };
      }
    },
    close: () => pool.end(),
  };
}
