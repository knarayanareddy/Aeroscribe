import type { Pool } from 'pg';
import type { PipelineRun } from '@aeroscribe/pipeline';
import type { RunStore } from '../ports';
import { storeError } from './client';

/**
 * Runs and their per-run options, one `jsonb` document each.
 *
 * The document is the column, not an interpretation of the columns: a run is a
 * whole object that one stage rewrites, and shredding it into columns would
 * mean a migration every time a stage adds a field. `created_at`/`updated_at`
 * are duplicated out of the document so `list()` can order without parsing
 * every row.
 *
 * `id` and the timestamps come from the document, never from `now()`: the run
 * carries the clock the orchestrator was given, and a test that pins it must
 * see the same timestamps coming back.
 */
export class PostgresRunStore implements RunStore {
  constructor(
    private readonly pool: Pool,
    private readonly databaseUrl: string,
  ) {}

  async save(run: PipelineRun): Promise<PipelineRun> {
    try {
      await this.pool.query(
        `INSERT INTO runs (id, doc, created_at, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
        [run.id, JSON.stringify(run), run.createdAt, run.updatedAt],
      );
      return run;
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async get(runId: string): Promise<PipelineRun | null> {
    try {
      const { rows } = await this.pool.query<{ doc: PipelineRun }>(
        'SELECT doc FROM runs WHERE id = $1',
        [runId],
      );
      return rows[0]?.doc ?? null;
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async list(): Promise<PipelineRun[]> {
    try {
      // Newest first, id breaking a timestamp tie — the same order the
      // filesystem adapter produces, asserted by the shared contract suite.
      const { rows } = await this.pool.query<{ doc: PipelineRun }>(
        `SELECT doc FROM runs
          ORDER BY (doc->>'createdAt') DESC, id DESC`,
      );
      return rows.map((row) => row.doc);
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async remove(runId: string): Promise<void> {
    try {
      // `run_options` cascades from the foreign key.
      await this.pool.query('DELETE FROM runs WHERE id = $1', [runId]);
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async saveOptions(runId: string, options: unknown): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO run_options (run_id, doc) VALUES ($1, $2)
         ON CONFLICT (run_id) DO UPDATE SET doc = EXCLUDED.doc`,
        [runId, JSON.stringify(options ?? null)],
      );
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async getOptions<T>(runId: string): Promise<T | null> {
    try {
      const { rows } = await this.pool.query<{ doc: T }>(
        'SELECT doc FROM run_options WHERE run_id = $1',
        [runId],
      );
      return rows[0]?.doc ?? null;
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }
}
