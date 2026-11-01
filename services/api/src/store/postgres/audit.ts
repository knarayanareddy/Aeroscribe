import type { Pool } from 'pg';
import type { AuditEntry } from '@aeroscribe/contract';
import type { AuditQuery, AuditStore } from '../ports';
import { storeError } from './client';

/**
 * The audit trail, append-only by construction (there is no update path, and
 * no caller has one either).
 *
 * Unlike the evidence chain, audit rows are not hashed: the roadmap says so
 * (RULE-044 is `Partial` for exactly this reason) and pretending otherwise
 * would be worse than the gap. What they are is durable and ordered by a
 * server-side sequence, so a row cannot be re-timestamped by a clock skew
 * between two API instances.
 */
export class PostgresAuditStore implements AuditStore {
  constructor(
    private readonly pool: Pool,
    private readonly databaseUrl: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async record(entry: Omit<AuditEntry, 'at'>): Promise<void> {
    const at = this.clock().toISOString();
    try {
      await this.pool.query(
        'INSERT INTO audit (at, action, run_id, actor, detail) VALUES ($1, $2, $3, $4, $5)',
        [at, entry.action, entry.runId ?? null, entry.actor, JSON.stringify(entry.detail ?? null)],
      );
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async read(filter: AuditQuery = {}): Promise<{ entries: AuditEntry[]; malformed: number }> {
    try {
      const { rows } = await this.pool.query<{
        at: string;
        action: AuditEntry['action'];
        run_id: string | null;
        actor: string;
        detail: Record<string, unknown> | null;
      }>(
        `SELECT to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
                action, run_id, actor, detail
           FROM audit
          WHERE ($1::text IS NULL OR run_id = $1) AND ($2::text IS NULL OR action = $2)
          ORDER BY id ASC`,
        [filter.runId ?? null, filter.action ?? null],
      );

      const entries: AuditEntry[] = rows.map((row) => ({
        at: row.at,
        action: row.action,
        runId: row.run_id,
        actor: row.actor,
        ...(row.detail === null ? {} : { detail: row.detail }),
      }));

      // `limit` is applied to the end of the trail, as the filesystem adapter
      // does: the last N events, not the first N.
      return {
        entries: filter.limit ? entries.slice(-filter.limit) : entries,
        malformed: 0,
      };
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }
}
