import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { EvidenceKind, EvidenceRecord, RegistryVerification } from '@aeroscribe/contract';
import { GENESIS_HASH, hashPayload } from '../../lib/canonical';
import { digestRecord, verifyChain, type HashedFields } from '../chain';
import type { AppendEvidenceInput, EvidenceQuery, EvidenceStore } from '../ports';
import { storeError } from './client';

/**
 * The evidence chain in Postgres.
 *
 * Three mechanisms, in increasing order of desperation, keep the chain linear:
 *
 * 1. **One transaction per append** holding `pg_advisory_xact_lock`, so the
 *    read of the head and the insert of the next link cannot interleave between
 *    two API instances. This is what the in-process queue did for one process,
 *    moved to where every process can see it.
 * 2. **`seq bigint PRIMARY KEY`**, so even a writer that ignored the lock cannot
 *    claim a sequence number twice.
 * 3. **A trigger that raises on UPDATE, DELETE and TRUNCATE**, so this
 *    application — or `psql`, or a well-meaning operator — cannot rewrite a
 *    record. The hash chain remains the check of last resort if the trigger is
 *    dropped.
 *
 * The advisory lock is one global mutex, so appends serialise across all runs.
 * At a few appends per stage that is irrelevant; a chain 10 000 appends long
 * would still cost microseconds per append, and the correct fix then is
 * partitioning the lock key, not removing the lock.
 */

interface EvidenceRow {
  seq: string;
  id: string;
  kind: string;
  run_id: string;
  stage_id: number | null;
  label: string;
  payload: unknown;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  created_at: string;
}

/**
 * `created_at` is selected in the exact shape `Date#toISOString()` produces.
 *
 * That is not cosmetic: the timestamp is inside the hashed fields, so a value
 * that round-trips through Postgres differently — microsecond precision, a
 * local timezone — would make every record fail its own hash check on read. The
 * column stays `timestamptz` (correct for range queries and for a human reading
 * the table); only the projection is pinned.
 */
const CREATED_AT_ISO = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const COLUMNS = `seq, id, kind, run_id, stage_id, label, payload, payload_hash, prev_hash, hash, ${CREATED_AT_ISO} AS created_at`;

function toRecord(row: EvidenceRow): EvidenceRecord {
  return {
    seq: Number(row.seq),
    id: row.id,
    kind: row.kind as EvidenceKind,
    runId: row.run_id,
    stageId: row.stage_id,
    label: row.label,
    createdAt: row.created_at,
    payloadHash: row.payload_hash,
    prevHash: row.prev_hash,
    payload: row.payload,
    hash: row.hash,
  };
}

export class PostgresEvidenceStore implements EvidenceStore {
  constructor(
    private readonly pool: Pool,
    private readonly databaseUrl: string,
    private readonly options: { clock?: () => Date; newId?: () => string } = {},
  ) {}

  private get clock(): () => Date {
    return this.options.clock ?? (() => new Date());
  }

  private get newId(): () => string {
    return this.options.newId ?? (() => randomUUID());
  }

  async append(input: AppendEvidenceInput): Promise<EvidenceRecord> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }

    try {
      await client.query('BEGIN');
      // The whole append is one serialised section: lock, read the head, insert.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aeroscribe.evidence'))");

      const head = await client.query<{ seq: string; hash: string }>(
        'SELECT seq, hash FROM evidence ORDER BY seq DESC LIMIT 1',
      );
      const previous = head.rows[0];
      const payloadHash = hashPayload(input.payload);

      const fields: HashedFields = {
        seq: previous === undefined ? 0 : Number(previous.seq) + 1,
        id: this.newId(),
        kind: input.kind,
        runId: input.runId,
        stageId: input.stageId ?? null,
        label: input.label,
        createdAt: input.createdAt ?? this.clock().toISOString(),
        payloadHash,
        prevHash: previous?.hash ?? GENESIS_HASH,
      };

      const record: EvidenceRecord = {
        ...fields,
        payload: input.payload,
        hash: digestRecord(fields),
      };

      await client.query(
        `INSERT INTO evidence (seq, id, kind, run_id, stage_id, label, payload, payload_hash, prev_hash, hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          record.seq,
          record.id,
          record.kind,
          record.runId,
          record.stageId,
          record.label,
          JSON.stringify(record.payload),
          record.payloadHash,
          record.prevHash,
          record.hash,
          record.createdAt,
        ],
      );

      await client.query('COMMIT');
      return record;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw storeError(error, this.databaseUrl);
    } finally {
      client.release();
    }
  }

  async list(filter: EvidenceQuery = {}): Promise<EvidenceRecord[]> {
    try {
      const { rows } = await this.pool.query<EvidenceRow>(
        `SELECT ${COLUMNS} FROM evidence
          WHERE ($1::text IS NULL OR run_id = $1) AND ($2::text IS NULL OR kind = $2)
          ORDER BY seq ASC`,
        [filter.runId ?? null, filter.kind ?? null],
      );
      return rows.map(toRecord);
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async get(seq: number): Promise<EvidenceRecord | null> {
    try {
      const { rows } = await this.pool.query<EvidenceRow>(
        `SELECT ${COLUMNS} FROM evidence WHERE seq = $1`,
        [seq],
      );
      return rows[0] === undefined ? null : toRecord(rows[0]);
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  async latest(runId: string, kind: EvidenceKind): Promise<EvidenceRecord | null> {
    try {
      const { rows } = await this.pool.query<EvidenceRow>(
        `SELECT ${COLUMNS} FROM evidence WHERE run_id = $1 AND kind = $2 ORDER BY seq DESC LIMIT 1`,
        [runId, kind],
      );
      return rows[0] === undefined ? null : toRecord(rows[0]);
    } catch (error) {
      throw storeError(error, this.databaseUrl);
    }
  }

  /**
   * Verify from the database, not from any cache.
   *
   * The walk is the same function the filesystem adapter uses — one
   * implementation, so "verifies" cannot mean two different things.
   */
  async verify(): Promise<RegistryVerification> {
    try {
      const { rows } = await this.pool.query<EvidenceRow>(
        `SELECT ${COLUMNS} FROM evidence ORDER BY seq ASC`,
      );
      return verifyChain(rows.map(toRecord));
    } catch (error) {
      const wrapped = storeError(error, this.databaseUrl);
      // An unreachable database is an outage, not a broken chain: accusing the
      // registry of tampering because the network is down would be a false
      // alarm on the one page a reviewer checks after an incident.
      if (wrapped !== error) throw wrapped;
      return {
        valid: false,
        records: 0,
        head: GENESIS_HASH,
        reason: `the evidence table could not be read (${(error as Error).message}). Has \`npm run db:migrate\` been run?`,
      };
    }
  }
}
