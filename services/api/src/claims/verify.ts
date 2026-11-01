import type { EvidenceRecord } from '../store';
import {
  extractDois,
  extractNumericTokens,
  significantDigits,
  STRUCTURAL_REFERENCE,
  type NumericToken,
} from './extract';

// Report shapes are the wire contract: `/api/v1/claims/verify` returns this and
// the dashboard renders `unbacked`.
import type { ClaimReport, UnbackedClaim } from '@aeroscribe/contract';

export type { UnbackedClaim, ClaimReport };

export interface ClaimPolicy {
  /** Numbers that may be quoted, taken from evidence payloads. */
  allowedValues: Array<{ value: number; tolerance: number }>;
  /**
   * Scalars the generator derived from evidence by counting (references,
   * meshes, gaps). They are asserted exactly, and each one records where it
   * came from so a reviewer can recompute it.
   */
  derived: Array<{ value: number; source: string }>;
  /** DOIs that were verified for this run. */
  allowedDois: string[];
  /** Numbers outside this band are always allowed (page counts, years, sections). */
  structuralRange?: { min: number; max: number };
}

const DEFAULT_STRUCTURAL_RANGE = { min: 1900, max: 2100 };

/**
 * A quoted measurement must show at least this many significant digits, so
 * "0.4" cannot be used to claim a value that evidence records as 0.4264.
 * Single-digit integers are only accepted when policy lists them as derived.
 */
const MIN_QUOTED_DIGITS = 2;

/**
 * Collect every finite number that appears anywhere in evidence payloads.
 *
 * The tolerance is relative for large numbers and absolute for small ones, so a
 * coefficient quoted as `0.314` matches a stored `0.31415927` while a count of
 * `147` does not accidentally match `148`.
 */
export function collectAllowedValues(records: readonly EvidenceRecord[]): number[] {
  const values: number[] = [];

  const visit = (node: unknown): void => {
    if (typeof node === 'number' && Number.isFinite(node)) {
      values.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(visit);
    }
  };

  for (const record of records) visit(record.payload);
  return values;
}

export function buildPolicy(
  records: readonly EvidenceRecord[],
  options: { derived?: ReadonlyArray<{ value: number; source: string }> } = {},
): ClaimPolicy {
  const allowedDois = new Set<string>();

  for (const record of records) {
    const visit = (node: unknown): void => {
      if (typeof node === 'string' && /^10\.\d{4,9}\//i.test(node)) {
        allowedDois.add(node.toLowerCase());
        return;
      }
      if (node && typeof node === 'object') {
        Object.values(node as Record<string, unknown>).forEach(visit);
      }
    };
    visit(record.payload);
  }

  return {
    allowedValues: collectAllowedValues(records).map((value) => ({
      value,
      tolerance: Math.max(Math.abs(value) * 1e-6, 1e-9),
    })),
    derived: (options.derived ?? []).map((entry) => ({
      value: entry.value,
      source: entry.source,
    })),
    allowedDois: Array.from(allowedDois),
  };
}

/**
 * Decide whether a numeric token is a claim that needs evidence.
 *
 * Allowed without evidence:
 * - numbers immediately preceded by a structural word ("Figure 3", "Section 2");
 * - citation markers such as `[12]`;
 * - years in the structural range (1900–2100) — these come from the reference
 *   list, whose entries are already DOI-verified.
 *
 * Everything else — including "about 40% faster" — must match a number that a
 * registry record actually contains, within tolerance (RULE-001).
 */
export function classifyToken(
  token: NumericToken,
  text: string,
  policy: ClaimPolicy,
): UnbackedClaim | null {
  const before = text.slice(0, token.index).trimEnd();
  if (STRUCTURAL_REFERENCE.test(before)) return null;

  const bracket = before.match(/\[[^\]]*$/);
  if (bracket) return null;

  // A year is structural only in the form a reference list uses it: "(2024)".
  // "reduced cost by 2024" must not slip through as a year.
  const range = policy.structuralRange ?? DEFAULT_STRUCTURAL_RANGE;
  const integer = Number.isInteger(token.value);
  const parenthesised =
    /[([]\s*$/.test(before) && /^\s*[)\]]/.test(text.slice(token.index + token.raw.length));
  if (
    integer &&
    token.value >= range.min &&
    token.value <= range.max &&
    !token.unit &&
    parenthesised
  ) {
    return null;
  }

  const digits = significantDigits(token.raw);

  const exact = policy.allowedValues.some(
    (allowed) => Math.abs(allowed.value - token.value) <= Math.max(allowed.tolerance, 1e-9),
  );
  if (exact) return null;

  // A rounded quotation is backed only when it is a correct rounding of an
  // evidence value at the precision the author chose to print.
  if (digits >= MIN_QUOTED_DIGITS) {
    const rounded = policy.allowedValues.some(
      (allowed) =>
        Math.abs(allowed.value) > 0 && Number(allowed.value.toPrecision(digits)) === token.value,
    );
    if (rounded) return null;
  }

  const derived = policy.derived.some(
    (entry) => Math.abs(entry.value - token.value) <= Math.max(Math.abs(entry.value) * 1e-9, 1e-12),
  );
  if (derived) return null;

  return {
    token: token.raw,
    value: token.value,
    context: token.context.trim(),
    reason: 'no evidence record contains this value',
  };
}

/**
 * Verify that every quantitative claim in `text` is backed by evidence and that
 * every DOI in it was DOI-resolved for this run.
 */
export function verifyClaims(text: string, policy: ClaimPolicy): ClaimReport {
  const observedDois = extractDois(text);

  // A DOI contains digits that are not claims: mask the DOI spans (keeping
  // string length so token indices stay valid) before extracting numbers.
  let masked = text;
  for (const doi of observedDois) {
    masked =
      masked.slice(0, doi.index) +
      ' '.repeat(doi.raw.length) +
      masked.slice(doi.index + doi.raw.length);
  }

  const tokens = extractNumericTokens(masked);
  const unbacked: UnbackedClaim[] = [];

  for (const token of tokens) {
    const problem = classifyToken(token, text, policy);
    if (problem) unbacked.push(problem);
  }

  const allowed = new Set(policy.allowedDois.map((doi) => doi.toLowerCase()));

  for (const doi of observedDois) {
    if (!allowed.has(doi.normalised)) {
      unbacked.push({
        token: doi.raw,
        value: Number.NaN,
        context: `DOI ${doi.raw}`,
        reason: 'DOI was not verified against a registry for this run (RULE-002)',
      });
    }
  }

  return {
    ok: unbacked.length === 0,
    checked: tokens.length + observedDois.length,
    unbacked,
    allowedDois: policy.allowedDois,
    observedDois: observedDois.map((doi) => doi.normalised),
  };
}
