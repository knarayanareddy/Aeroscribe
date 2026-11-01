import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Pool } from 'pg';

/**
 * Migrations, applied in file-name order, one transaction each.
 *
 * Every statement of a migration commits with its row in `schema_migrations`,
 * so a crash leaves the database at a version it can describe. Applying the
 * same migration twice is a no-op, which is what makes `db:migrate` safe to run
 * on every boot and from a deploy script.
 *
 * The files are read from disk rather than embedded as strings: a migration is
 * a historical document, and one that a reviewer can read as SQL — with its
 * comments — is worth more than one quoted inside TypeScript.
 */

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export interface MigrationOptions {
  /** Defaults to the `migrations/` directory beside this file. */
  directory?: string;
}

export async function runMigrations(
  pool: Pool,
  { directory = migrationsDirectory }: MigrationOptions = {},
): Promise<MigrationResult> {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((row) => row.version));
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(directory, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(error as Error).message}`, { cause: error });
    } finally {
      client.release();
    }
  }

  return { applied, alreadyApplied: files.filter((file) => done.has(file)) };
}

/** Files on disk, in the order they would run. Used by the CLI and the docs test. */
export async function migrationFiles({ directory = migrationsDirectory }: MigrationOptions = {}) {
  return (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
}
