import { GENESIS_HASH, canonicalJson, hashEquals, hashPayload, sha256 } from '../lib/canonical';
import type { EvidenceKind, EvidenceRecord, RegistryVerification } from '@aeroscribe/contract';

/**
 * The chain algorithm, written once.
 *
 * Every adapter has to produce the same digest for the same record and the same
 * verdict for the same tampering — otherwise "verifies" would mean different
 * things depending on which store the process happens to use, and a run
 * imported from one backend into another would silently stop verifying. So the
 * hashing and the walk live here, and the adapters only supply storage.
 */

/**
 * The fields a record's `hash` covers.
 *
 * `payload` is deliberately absent: it is represented by `payloadHash`, which
 * is computed from a canonical serialisation of it. That keeps the digest
 * stable across backends that reorder JSON keys (a `jsonb` column does).
 */
export interface HashedFields {
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

export function hashedFieldsOf(record: EvidenceRecord): HashedFields {
  return {
    seq: record.seq,
    id: record.id,
    kind: record.kind,
    runId: record.runId,
    stageId: record.stageId,
    label: record.label,
    createdAt: record.createdAt,
    payloadHash: record.payloadHash,
    prevHash: record.prevHash,
  };
}

/** The digest of one record, i.e. the `hash` field it carries. */
export function digestRecord(fields: HashedFields): string {
  return sha256(canonicalJson(fields));
}

/**
 * Walk a chain in `seq` order and report the first inconsistency.
 *
 * Detects every value edit (payload, metadata), every reordering and every
 * deletion: a deleted link leaves the next record pointing at a hash that is no
 * longer its predecessor's, and a reordering leaves a record whose `seq` is not
 * where the walk expects it.
 */
export function verifyChain(records: readonly EvidenceRecord[]): RegistryVerification {
  let previous = GENESIS_HASH;

  for (const [index, record] of records.entries()) {
    const head = records.at(-1)?.hash ?? GENESIS_HASH;

    if (record.seq !== index) {
      return {
        valid: false,
        records: records.length,
        head,
        brokenAt: index,
        reason: `expected seq ${index}, found ${record.seq}`,
      };
    }

    if (record.prevHash !== previous) {
      return {
        valid: false,
        records: records.length,
        head,
        brokenAt: record.seq,
        reason: 'prevHash does not match the previous record',
      };
    }

    if (record.payloadHash !== hashPayload(record.payload)) {
      return {
        valid: false,
        records: records.length,
        head,
        brokenAt: record.seq,
        reason: 'payload does not match its recorded payloadHash',
      };
    }

    if (!hashEquals(digestRecord(hashedFieldsOf(record)), record.hash)) {
      return {
        valid: false,
        records: records.length,
        head,
        brokenAt: record.seq,
        reason: 'record hash does not recompute (metadata was edited)',
      };
    }

    previous = record.hash;
  }

  return { valid: true, records: records.length, head: previous };
}
