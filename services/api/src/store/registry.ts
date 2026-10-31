import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { GENESIS_HASH, canonicalJson, hashEquals, hashPayload, sha256 } from '../lib/canonical';

/**
 * What a stage can write. One record per stage, so the list is the union of the
 * `kind` each handler returns.
 *
 * Deliberately narrow: `doi-verification`, `gci-study` and `wiki-article` used to
 * be declared here but no stage ever wrote them, which made a `kind=` filter
 * look like a empty result set rather than a kind that does not exist.
 */
export const EVIDENCE_KINDS = [
  'stage-output',
  'literature-search',
  'cfd-run',
  'novelty-report',
  'manuscript',
  'review-report',
  'compliance-report',
  'submission-package',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * One immutable entry in the evidence registry.
 *
 * `hash` covers every other field, including `prevHash`, so the records form a
 * hash chain: changing, reordering, inserting or deleting a record breaks the
 * chain at that point and every later link. This is the mechanism behind
 * RULE-041 (checksum every computed artefact) and RULE-043 (append-only).
 */
export interface EvidenceRecord {
  seq: number;
  id: string;
  kind: EvidenceKind;
  runId: string;
  stageId: number | null;
  label: string;
  createdAt: string;
  payload: unknown;
  payloadHash: string;
  prevHash: string;
  hash: string;
}

export interface AppendEvidenceInput {
  kind: EvidenceKind;
  runId: string;
  stageId?: number | null;
  label: string;
  payload: unknown;
  /** Overrides the clock; used by tests to make chains reproducible. */
  createdAt?: string;
}

export interface VerificationResult {
  valid: boolean;
  records: number;
  head: string;
  /** First `seq` whose linkage or digest does not recompute, if any. */
  brokenAt?: number;
  reason?: string;
}

interface HashedFields {
  seq: number;
  id: string;
  kind: EvidenceKind;
  runId: string;
  stageId: number | null;
  label: string;
  createdAt: string;
  payloadHash: string;
  prevHash: string;
}

function digestRecord(fields: HashedFields): string {
  return sha256(canonicalJson(fields));
}

/**
 * Append-only, hash-chained evidence registry backed by one NDJSON file.
 *
 * Design notes, stated plainly because they are limitations:
 * - **Single writer.** Appends are serialised inside one process. Running two
 *   API processes against the same file would interleave lines; a real
 *   deployment needs a database with a unique constraint on `seq` (see
 *   `docs/BACKEND.md`).
 * - **No deletion, ever.** There is no API to remove a record. If the file is
 *   edited outside the process, `verify()` reports exactly where.
 * - **In memory index, on disk truth.** Listing uses the in-memory index;
 *   verification always re-reads the file.
 */
export class EvidenceRegistry {
  private readonly path: string;
  private readonly clock: () => Date;
  private readonly newId: () => string;
  private records: EvidenceRecord[] = [];
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string, options: { clock?: () => Date; newId?: () => string } = {}) {
    this.path = path;
    this.clock = options.clock ?? (() => new Date());
    this.newId = options.newId ?? (() => randomUUID());
  }

  get filePath(): string {
    return this.path;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.records = await this.readAll();
    this.loaded = true;
  }

  get head(): string {
    return this.records.at(-1)?.hash ?? GENESIS_HASH;
  }

  get size(): number {
    return this.records.length;
  }

  /** Append one record and return it. Serialised: concurrent calls queue up. */
  async append(input: AppendEvidenceInput): Promise<EvidenceRecord> {
    const operation = this.queue.then(async () => {
      await this.load();

      const payloadHash = hashPayload(input.payload);
      const fields: HashedFields = {
        seq: this.records.length,
        id: this.newId(),
        kind: input.kind,
        runId: input.runId,
        stageId: input.stageId ?? null,
        label: input.label,
        createdAt: input.createdAt ?? this.clock().toISOString(),
        payloadHash,
        prevHash: this.head,
      };

      const record: EvidenceRecord = {
        ...fields,
        payload: input.payload,
        hash: digestRecord(fields),
      };

      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8');
      this.records.push(record);
      return record;
    });

    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async list(filter: { runId?: string; kind?: EvidenceKind } = {}): Promise<EvidenceRecord[]> {
    await this.load();
    return this.records.filter(
      (record) =>
        (filter.runId === undefined || record.runId === filter.runId) &&
        (filter.kind === undefined || record.kind === filter.kind),
    );
  }

  async get(seq: number): Promise<EvidenceRecord | null> {
    await this.load();
    return this.records.find((record) => record.seq === seq) ?? null;
  }

  /** Latest record of a kind for a run, e.g. the newest manuscript. */
  async latest(runId: string, kind: EvidenceKind): Promise<EvidenceRecord | null> {
    const matches = await this.list({ runId, kind });
    return matches.at(-1) ?? null;
  }

  /**
   * Recompute the whole chain from disk and report the first inconsistency.
   * Detects edited payloads, edited metadata, reordered and deleted records.
   */
  async verify(): Promise<VerificationResult> {
    let onDisk: EvidenceRecord[];
    try {
      onDisk = await this.readAll();
    } catch (error) {
      return {
        valid: false,
        records: 0,
        head: GENESIS_HASH,
        reason: `unreadable registry file: ${(error as Error).message}`,
      };
    }

    let previous = GENESIS_HASH;

    for (const [index, record] of onDisk.entries()) {
      if (record.seq !== index) {
        return {
          valid: false,
          records: onDisk.length,
          head: onDisk.at(-1)?.hash ?? GENESIS_HASH,
          brokenAt: index,
          reason: `expected seq ${index}, found ${record.seq}`,
        };
      }

      if (record.prevHash !== previous) {
        return {
          valid: false,
          records: onDisk.length,
          head: onDisk.at(-1)?.hash ?? GENESIS_HASH,
          brokenAt: record.seq,
          reason: 'prevHash does not match the previous record',
        };
      }

      if (record.payloadHash !== hashPayload(record.payload)) {
        return {
          valid: false,
          records: onDisk.length,
          head: onDisk.at(-1)?.hash ?? GENESIS_HASH,
          brokenAt: record.seq,
          reason: 'payload does not match its recorded payloadHash',
        };
      }

      const expected = digestRecord({
        seq: record.seq,
        id: record.id,
        kind: record.kind,
        runId: record.runId,
        stageId: record.stageId,
        label: record.label,
        createdAt: record.createdAt,
        payloadHash: record.payloadHash,
        prevHash: record.prevHash,
      });

      if (!hashEquals(expected, record.hash)) {
        return {
          valid: false,
          records: onDisk.length,
          head: onDisk.at(-1)?.hash ?? GENESIS_HASH,
          brokenAt: record.seq,
          reason: 'record hash does not recompute (metadata was edited)',
        };
      }

      previous = record.hash;
    }

    return { valid: true, records: onDisk.length, head: previous };
  }

  private async readAll(): Promise<EvidenceRecord[]> {
    let contents: string;
    try {
      contents = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    return contents
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as EvidenceRecord);
  }
}

/** Stable short fingerprint of a payload, for display next to a result. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…${hash.slice(-4)}`;
}

/** Hash of an arbitrary file buffer, e.g. a solver output artefact. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
