import type { PaperSource, ReferenceRecord, ReferenceVerification } from '@aeroscribe/contract';
import type { Paper } from './types';

/**
 * Structured reference records.
 *
 * A citation is a claim about a work: authors, title, year, venue, volume,
 * pages, DOI — each of which a citation style, a bibliography and a later
 * re-check need as a *field*. Stages used to carry a rendered citation string
 * and nothing else, so every consumer either re-parsed English or invented
 * what it could not parse.
 *
 * Two rules hold here:
 * - **Absent stays absent.** A provider that does not report a volume yields
 *   `null`; nothing is derived from the DOI, the year or the title.
 * - **Verification is a timestamped fact.** `verified` records when, where and
 *   against what the DOI resolved — so a reference can be re-checked later
 *   without guessing what was true when the manuscript was written.
 */
export type { ReferenceRecord, ReferenceVerification };

export interface ReferenceInput {
  paper: Paper;
  index: number;
  /** Omit for a reference that was not resolved in this run. */
  verification?: {
    verifiedAt: string;
    provider?: PaperSource | null;
    titleSimilarity?: number | null;
  };
}

/** `ref-01`, `ref-02`, … — zero-padded so lexical order is citation order. */
export function referenceKey(index: number): string {
  return `ref-${String(index).padStart(2, '0')}`;
}

/**
 * Convert a provider record into the stored form.
 *
 * `venue` falls back to the provider's own name only where the provider *is* the
 * publication venue (an arXiv preprint is published on arXiv). Every other
 * absent field becomes `null`.
 */
export function toReferenceRecord({ paper, index, verification }: ReferenceInput): ReferenceRecord {
  return {
    key: referenceKey(index),
    index,
    doi: paper.doi,
    title: paper.title.trim().length > 0 ? paper.title.trim() : null,
    authors: [...paper.authors],
    year: paper.year,
    venue: paper.containerTitle ?? (paper.source === 'arxiv' ? 'arXiv preprint' : null),
    volume: paper.volume ?? null,
    pages: paper.pages ?? null,
    publisher: paper.publisher ?? null,
    url: paper.url,
    verified: {
      verifiedAt: verification?.verifiedAt ?? null,
      provider: verification?.provider ?? null,
      titleSimilarity: verification?.titleSimilarity ?? null,
    },
  };
}

/** Fields a citation style needs but this record does not carry. */
export function missingFields(reference: ReferenceRecord): string[] {
  const missing: string[] = [];
  if (reference.authors.length === 0) missing.push('authors');
  if (reference.title === null) missing.push('title');
  if (reference.year === null) missing.push('year');
  if (reference.venue === null) missing.push('venue');
  if (reference.doi === null) missing.push('doi');
  return missing;
}

/** A short human label that never invents a title. */
export function referenceLabel(reference: ReferenceRecord): string {
  if (reference.title) return reference.title;
  if (reference.doi) return `DOI ${reference.doi}`;
  return `reference ${reference.key}`;
}

interface LegacyReference {
  index?: number;
  citation?: string;
  doi?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStructured(value: unknown): value is ReferenceRecord {
  return isRecord(value) && typeof value.key === 'string' && 'verified' in value;
}

function upgradeLegacy(value: LegacyReference, fallbackIndex: number): ReferenceRecord {
  const index = typeof value.index === 'number' ? value.index : fallbackIndex;
  return {
    key: referenceKey(index),
    index,
    doi: typeof value.doi === 'string' && value.doi.length > 0 ? value.doi : null,
    // The citation string is deliberately not mined for a title: a v1 record
    // cannot prove which part of the text was the title.
    title: null,
    authors: [],
    year: null,
    venue: null,
    volume: null,
    pages: null,
    publisher: null,
    url: null,
    verified: { verifiedAt: null, provider: null, titleSimilarity: null },
    legacy: true,
  };
}

/**
 * Read the `references` array of a stored payload, whatever version wrote it.
 *
 * v2 payloads contain `ReferenceRecord`s. v1 payloads contain
 * `{ index, citation, doi }`, which upgrade to records with `legacy: true` and
 * every unprovable field set to null. Unknown shapes are skipped, not guessed.
 */
export function readReferences(payload: unknown): ReferenceRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.references)) return [];
  return payload.references
    .map((entry, position) =>
      isStructured(entry)
        ? entry
        : isRecord(entry)
          ? upgradeLegacy(entry as LegacyReference, position + 1)
          : null,
    )
    .filter((entry): entry is ReferenceRecord => entry !== null)
    .sort((a, b) => a.index - b.index);
}
