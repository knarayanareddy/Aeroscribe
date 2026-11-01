import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import type { AuditEntry, EvidenceRecord } from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { verifyChain } from '../chain';

/**
 * Copy a filesystem deployment into Postgres, verbatim.
 *
 * "Verbatim" is the whole requirement: every record keeps its `seq`, `id`,
 * `prevHash`, `hash` and `createdAt`, so the chain that arrives is the chain
 * that left. A migration that recomputes a digest is a failed migration — it
 * would turn an intact history into one that `db:verify` reports as tampered
 * with, and nobody could tell the difference from a real attack.
 *
 * The import refuses a non-empty database rather than merging: two chains have
 * no defined merge, and guessing one would be the dishonest option.
 */

export interface ImportResult {
  evidence: number;
  runs: number;
  runOptions: number;
  audit: number;
  verification: ReturnType<typeof verifyChain>;
}

async function lines(path: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function importDataDir(pool: Pool, dataDir: string): Promise<ImportResult> {
  const { rows: existing } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM evidence',
  );
  if (Number(existing[0]?.count ?? '0') > 0) {
    throw new Error(
      `the target database already has ${existing[0]?.count} evidence record(s). ` +
        'Import into an empty database: merging two chains has no defined meaning.',
    );
  }

  const records = (await lines(join(dataDir, 'registry.ndjson'))).map(
    (line) => JSON.parse(line) as EvidenceRecord,
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const record of records) {
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
    }

    const runsDir = join(dataDir, 'runs');
    let runFiles: string[] = [];
    try {
      runFiles = (await readdir(runsDir)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    let runCount = 0;
    let optionCount = 0;
    for (const file of runFiles) {
      const doc = JSON.parse(await readFile(join(runsDir, file), 'utf8')) as unknown;
      if (file.endsWith('.options.json')) {
        const runId = file.slice(0, -'.options.json'.length);
        // The foreign key refuses an options document whose run is missing,
        // which is what we want: a dangling sidecar is not imported silently.
        await client.query('INSERT INTO run_options (run_id, doc) VALUES ($1, $2)', [
          runId,
          JSON.stringify(doc),
        ]);
        optionCount += 1;
        continue;
      }

      const run = doc as PipelineRun;
      await client.query(
        'INSERT INTO runs (id, doc, created_at, updated_at) VALUES ($1, $2, $3, $4)',
        [run.id, JSON.stringify(run), run.createdAt, run.updatedAt],
      );
      runCount += 1;
    }

    const audit = (await lines(join(dataDir, 'audit.ndjson'))).map(
      (line) => JSON.parse(line) as AuditEntry,
    );
    for (const entry of audit) {
      await client.query(
        'INSERT INTO audit (at, action, run_id, actor, detail) VALUES ($1, $2, $3, $4, $5)',
        [
          entry.at,
          entry.action,
          entry.runId ?? null,
          entry.actor,
          JSON.stringify(entry.detail ?? null),
        ],
      );
    }

    await client.query('COMMIT');

    // Read the result back on the same connection, not through the pool: the
    // client is still checked out until the `finally` below, and a pool sized
    // at one connection (which is how `db:import` runs) would otherwise wait
    // for itself until the connect timeout fired.
    const { rows } = await client.query<{
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
    }>(
      `SELECT seq, id, kind, run_id, stage_id, label, payload, payload_hash, prev_hash, hash,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM evidence ORDER BY seq ASC`,
    );

    const verification = verifyChain(
      rows.map((row) => ({
        seq: Number(row.seq),
        id: row.id,
        kind: row.kind as EvidenceRecord['kind'],
        runId: row.run_id,
        stageId: row.stage_id,
        label: row.label,
        createdAt: row.created_at,
        payloadHash: row.payload_hash,
        prevHash: row.prev_hash,
        payload: row.payload,
        hash: row.hash,
      })),
    );

    return {
      evidence: records.length,
      runs: runCount,
      runOptions: optionCount,
      audit: audit.length,
      verification,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
