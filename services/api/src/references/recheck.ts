import type {
  DoiRecheckPayload,
  DoiVerification,
  EvidenceRecord,
  ManuscriptReference,
  PaperSource,
  RecheckResult,
  ReferenceStanding,
  ReferenceStatusEntry,
  ReferenceStatusResponse,
} from '@aeroscribe/contract';
import type { LiteratureService } from '../literature';
import { readReferences } from '../literature/reference';
import type { EvidenceStore } from '../store';

/**
 * Re-checking the DOIs a stored manuscript cites.
 *
 * A verification is a fact with a timestamp, not a property of a string. Stage 5
 * resolves every DOI before it may cite it, and then never looks again: a paper
 * retired by its publisher, or a DOI that now points at a different article,
 * leaves no trace in the manuscript. This module produces the *new* fact.
 *
 * Three rules shape it:
 *
 * - **Never mutate, always append.** The manuscript payload is read and left
 *   byte-identical; the result is a new `doi-recheck` record, so the registry's
 *   hash chain proves the manuscript itself did not change.
 * - **The five statuses are exhaustive and none of them is a guess.** A DOI that
 *   was not checked (offline, absent, malformed) is `unverified` — never `fresh`
 *   and never counted as a pass.
 * - **`stale` is reported, not failed.** A manuscript older than the limit still
 *   points at a paper that resolves; that is worth saying and not worth blocking
 *   a run over. `broken` and `mismatch` are.
 */

export interface ClassifyInput {
  /** True when the literature service was in offline mode for this check. */
  offline: boolean;
  /** The DOI stored on the reference, after normalisation by the reader. */
  doi: string | null;
  /** The outcome of resolving it now, or null when no attempt was made. */
  verification: DoiVerification | null;
  /** The manuscript's own generation-time verification timestamp. */
  previousVerifiedAt: string | null;
  now: Date;
  maxAgeDays: number;
}

export interface Classification {
  status: RecheckResult['status'];
  reason: string | null;
  provider: PaperSource | null;
  titleSimilarity: number | null;
}

const DAY_MS = 86_400_000;

/** Whole days between an ISO timestamp and `now`; never negative. */
export function ageInDays(then: string, now: Date): number {
  const from = Date.parse(then);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((now.getTime() - from) / DAY_MS));
}

/**
 * Classify one reference.
 *
 * Pure and total: given the same inputs it always answers the same status, which
 * is what makes the five cases testable without a network or a clock.
 */
export function classifyVerification(input: ClassifyInput): Classification {
  const { offline, doi, verification, previousVerifiedAt, now, maxAgeDays } = input;

  if (doi === null) {
    return {
      status: 'unverified',
      reason: 'no DOI is recorded for this reference, so there is nothing to resolve (RULE-002)',
      provider: null,
      titleSimilarity: null,
    };
  }

  if (offline) {
    // Deliberately does not use the word "verified": nothing was checked, and a
    // sentence that reads like a pass is how an offline run gets quoted as one.
    return {
      status: 'unverified',
      reason: 'offline mode: no registry was contacted, so the stored check was not repeated',
      provider: null,
      titleSimilarity: null,
    };
  }

  if (verification === null) {
    return {
      status: 'unverified',
      reason: 'no verification was attempted for this reference',
      provider: null,
      titleSimilarity: null,
    };
  }

  if (verification.verified) {
    const age = previousVerifiedAt === null ? null : ageInDays(previousVerifiedAt, now);
    if (age !== null && age > maxAgeDays) {
      return {
        status: 'stale',
        reason: `resolves now; the manuscript's check was ${age} day${age === 1 ? '' : 's'} old (limit ${maxAgeDays})`,
        provider: verification.provider ?? null,
        titleSimilarity: verification.titleSimilarity ?? null,
      };
    }
    return {
      status: 'fresh',
      reason: age === null ? 'resolves now; the manuscript carried no earlier verification' : null,
      provider: verification.provider ?? null,
      titleSimilarity: verification.titleSimilarity ?? null,
    };
  }

  if (verification.candidate) {
    const { title, similarity, provider } = verification.candidate;
    return {
      status: 'mismatch',
      reason:
        similarity === null
          ? `resolves to a different title: "${title}"`
          : `resolves to a different title (similarity ${similarity.toFixed(2)}): "${title}"`,
      provider,
      titleSimilarity: similarity,
    };
  }

  return {
    status: 'broken',
    reason: verification.reason ?? 'the DOI did not resolve',
    provider: null,
    titleSimilarity: null,
  };
}

/**
 * The run's overall standing, by decreasing severity.
 *
 * `attention` when anything is broken or points at the wrong paper; otherwise
 * `unverified` if any reference could not be checked (a partially checked list is
 * not "current"); otherwise `stale` if any check is older than the limit;
 * otherwise `current`. No results at all means the run was never re-checked.
 */
export function overallStanding(
  results: readonly Pick<RecheckResult, 'status'>[],
): ReferenceStanding {
  if (results.length === 0) return 'unchecked';
  const has = (status: RecheckResult['status']) =>
    results.some((result) => result.status === status);
  if (has('broken') || has('mismatch')) return 'attention';
  if (has('unverified')) return 'unverified';
  if (has('stale')) return 'stale';
  return 'current';
}

/** Counts by status. Every reference in the manuscript is counted once. */
export function summarise(results: readonly RecheckResult[]): DoiRecheckPayload['summary'] {
  const count = (status: RecheckResult['status']) =>
    results.filter((result) => result.status === status).length;
  return {
    fresh: count('fresh'),
    stale: count('stale'),
    broken: count('broken'),
    mismatch: count('mismatch'),
    unverified: count('unverified'),
    total: results.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The rendered citation lines of a stored manuscript, keyed by list position. */
function citationsByIndex(payload: unknown): Map<number, string> {
  const out = new Map<number, string>();
  if (!isRecord(payload) || !Array.isArray(payload.references)) return out;
  for (const [position, entry] of payload.references.entries()) {
    if (!isRecord(entry)) continue;
    const index = typeof entry.index === 'number' ? entry.index : position + 1;
    if (typeof entry.citation === 'string') out.set(index, entry.citation);
  }
  return out;
}

function isStructuredRecord(value: unknown): value is ManuscriptReference['record'] {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.index === 'number' &&
    isRecord(value.verified)
  );
}

/**
 * A stored manuscript's references, whatever payload version wrote them.
 *
 * Stage 5 stores `ManuscriptReference` (`{ index, citation, doi, record }`),
 * while stage 1 stores bare `ReferenceRecord`s. Both appear in the registry, and
 * a re-check must read either without inventing the fields the older one lacks —
 * which is why the wrapped record is used when it exists and `readReferences`
 * (which upgrades v1 entries) is only the fallback.
 */
export function manuscriptReferences(payload: unknown): ManuscriptReference[] {
  if (!isRecord(payload) || !Array.isArray(payload.references)) return [];

  const citations = citationsByIndex(payload);
  const upgraded = new Map(readReferences(payload).map((record) => [record.index, record]));
  const references: ManuscriptReference[] = [];

  for (const [position, entry] of payload.references.entries()) {
    if (!isRecord(entry)) continue;
    const index = typeof entry.index === 'number' ? entry.index : position + 1;
    const wrapped = isRecord(entry.record) ? entry.record : null;
    const record = isStructuredRecord(wrapped) ? wrapped : upgraded.get(index);
    if (!record) continue;

    references.push({
      index,
      // A record with no stored citation line falls back to its title or key, and
      // never to a fabricated "Author et al.".
      citation: citations.get(index) ?? record.title ?? record.key,
      doi: record.doi ?? '',
      record,
    });
  }

  return references.sort((a, b) => a.index - b.index);
}

export interface RecheckDependencies {
  literature: LiteratureService;
  registry: EvidenceStore;
  clock?: () => Date;
  /** `AEROSCRIBE_DOI_MAX_AGE_DAYS`; only `stale` depends on it. */
  maxAgeDays: number;
}

export interface RecheckOutcome {
  record: EvidenceRecord;
  payload: DoiRecheckPayload;
}

/**
 * Resolve every DOI the run's manuscript cites, and append one record.
 *
 * Throws when the run has no manuscript: there is nothing to re-check, and
 * silently writing a record full of zeroes would look like a clean bill of
 * health for a run that produced no paper.
 */
export async function recheckRun(
  runId: string,
  { literature, registry, clock = () => new Date(), maxAgeDays }: RecheckDependencies,
): Promise<RecheckOutcome> {
  const records = await registry.list({ runId });
  const manuscripts = records.filter((record) => record.kind === 'manuscript');
  const manuscript = manuscripts.at(-1);
  if (!manuscript) {
    throw new Error(`run ${runId} has no manuscript record to re-check`);
  }

  const references = manuscriptReferences(manuscript.payload);
  const now = clock();
  const offline = literature.offline;

  const results: RecheckResult[] = [];
  for (const reference of references) {
    const { record } = reference;
    // `verifyDoi` is the same code path stage 5 used, so a re-check cannot apply
    // a different standard than the original verification did.
    const verification =
      record.doi === null
        ? null
        : await literature.verifyDoi(record.doi, {
            ...(record.title ? { expectedTitle: record.title } : {}),
          });

    const classification = classifyVerification({
      offline,
      doi: record.doi,
      verification,
      previousVerifiedAt: record.verified.verifiedAt,
      now,
      maxAgeDays,
    });

    results.push({
      key: record.key,
      doi: record.doi,
      title: record.title,
      status: classification.status,
      reason: classification.reason,
      provider: classification.provider,
      titleSimilarity: classification.titleSimilarity,
      previousVerifiedAt: record.verified.verifiedAt,
    });
  }

  const summary = summarise(results);
  const payload: DoiRecheckPayload = {
    stage: 'reference-recheck',
    schemaVersion: 1,
    runId,
    checkedAt: now.toISOString(),
    offline,
    maxAgeDays,
    results,
    summary,
  };

  const record = await registry.append({
    kind: 'doi-recheck',
    runId,
    // No stage ran: this record comes from an operator or a cron, not the
    // pipeline, and saying otherwise would corrupt the stage timeline.
    stageId: null,
    label: `DOI re-check: ${summary.total} reference${
      summary.total === 1 ? '' : 's'
    } (${describeSummary(summary)})`,
    payload,
    createdAt: payload.checkedAt,
  });

  return { record, payload };
}

/**
 * What stage 8 must say about the manuscript's references.
 *
 * Three additions, in the order a reader needs them:
 *
 * - a `broken` or `mismatch` result is a RULE-002 violation *now*, so each one
 *   becomes a blocker naming the reference and the reason;
 * - a manuscript with no re-check at all gets a blocker **only** once it is older
 *   than the limit — a paper written this morning has a generation-time
 *   verification that is still current, and demanding a re-check would be noise;
 * - a re-check that is itself older than the limit is reported, because the
 *   newest fact can be out of date too.
 */
export function referenceBlockers(input: {
  manuscriptGeneratedAt: string;
  now: Date;
  maxAgeDays: number;
  recheck: DoiRecheckPayload | null;
}): string[] {
  const { manuscriptGeneratedAt, now, maxAgeDays, recheck } = input;
  const blockers: string[] = [];

  if (recheck === null) {
    const age = ageInDays(manuscriptGeneratedAt, now);
    if (age > maxAgeDays) {
      blockers.push(
        `references have not been re-verified in this run (the manuscript is ${age} days old; the limit is ${maxAgeDays})`,
      );
    }
    return blockers;
  }

  for (const result of recheck.results) {
    if (result.status === 'broken') {
      blockers.push(
        `reference ${result.key}${result.doi ? ` (${result.doi})` : ''} no longer resolves: ${result.reason ?? 'no reason recorded'}`,
      );
    } else if (result.status === 'mismatch') {
      blockers.push(
        `reference ${result.key}${result.doi ? ` (${result.doi})` : ''} now resolves to a different paper: ${result.reason ?? 'no reason recorded'}`,
      );
    }
  }

  const recheckAge = ageInDays(recheck.checkedAt, now);
  if (recheckAge > maxAgeDays) {
    blockers.push(
      `the last DOI re-check is ${recheckAge} days old (limit ${maxAgeDays}); re-run it before submission`,
    );
  }

  return blockers;
}

/** A one-line, countable description that never rounds a problem away. */
export function describeSummary(summary: DoiRecheckPayload['summary']): string {
  return [
    `${summary.fresh} fresh`,
    `${summary.stale} stale`,
    `${summary.broken} broken`,
    `${summary.mismatch} mismatch`,
    `${summary.unverified} unverified`,
  ].join(', ');
}

/**
 * Join a run's references with the newest re-check.
 *
 * The manuscript is the source of the reference list — a re-check never adds or
 * removes a reference — and the record is the source of its standing. A run that
 * has never been re-checked reports `unchecked`, not a presumed `current`.
 */
export function referenceStatus(input: {
  runId: string;
  manuscriptPayload: unknown;
  rechecks: readonly EvidenceRecord[];
}): ReferenceStatusResponse {
  const { runId, manuscriptPayload, rechecks } = input;
  const references = manuscriptReferences(manuscriptPayload);

  const ordered = [...rechecks].sort((a, b) => a.seq - b.seq);
  const latest = ordered.at(-1);
  const latestPayload = latest?.payload as DoiRecheckPayload | undefined;
  const byKey = new Map<string, RecheckResult>(
    (latestPayload?.results ?? []).map((result) => [result.key, result]),
  );

  const entries: ReferenceStatusEntry[] = references.map((reference) => {
    const result = byKey.get(reference.record.key);
    return {
      key: reference.record.key,
      index: reference.index,
      doi: reference.record.doi,
      title: reference.record.title,
      citation: reference.citation,
      verifiedAt: reference.record.verified.verifiedAt,
      verifiedProvider: reference.record.verified.provider,
      latest:
        result && latest
          ? {
              status: result.status,
              checkedAt: latestPayload!.checkedAt,
              reason: result.reason,
              provider: result.provider,
              titleSimilarity: result.titleSimilarity,
              seq: latest.seq,
            }
          : null,
    };
  });

  return {
    runId,
    references: entries,
    checkedAt: latestPayload?.checkedAt ?? null,
    rechecks: ordered.length,
    status: latestPayload
      ? overallStanding(latestPayload.results)
      : ('unchecked' as ReferenceStanding),
  };
}
