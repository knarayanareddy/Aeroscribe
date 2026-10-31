import type {
  CfdEvidencePayload,
  DoiRecheckPayload,
  DoiRecheckSummary,
  EvidenceKind,
  EvidenceRecord,
  LiteraturePayload,
  ManuscriptPayload,
  ManuscriptRenderPayload,
  NoveltyPayload,
  ReferenceRecord,
  RecheckResult,
  ReviewPayload,
  WikiPayload,
} from '@aeroscribe/contract';

/**
 * Payload → view model.
 *
 * Every function here answers one question: *what can be shown from what the
 * server actually sent?* Where the API has no field, the mapper omits it and the
 * view says so. Nothing is defaulted, averaged or guessed — a missing year is
 * `null` and renders as "n.d.", not as the current year.
 */

/** The newest record of `kind` for one run, or null. */
export function latestRecord(
  records: readonly EvidenceRecord[],
  kind: EvidenceKind,
): EvidenceRecord | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record && record.kind === kind) return record;
  }
  return null;
}

/** The newest record of `kind` whose payload matches `guard`, or null. */
export function latestPayload<T>(
  records: readonly EvidenceRecord[],
  kind: EvidenceKind,
  guard: (payload: unknown) => payload is T,
): T | null {
  const record = latestRecord(records, kind);
  if (!record) return null;
  return guard(record.payload) ? record.payload : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/* ─────────────────────────────── literature ──────────────────────────────── */

export function isLiteraturePayload(payload: unknown): payload is LiteraturePayload {
  return isObject(payload) && payload['stage'] === 'literature-archaeology';
}

export interface LiveReference {
  /** `ref-01`, the key the server uses. */
  key: string;
  title: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  volume: string | null;
  pages: string | null;
  publisher: string | null;
  /** 1-based rank in the search result, when the provider record is present. */
  rank: number | null;
  citationCount: number | null;
  abstract: string | null;
  /** ISO timestamp of the DOI resolution that admitted this record. */
  verifiedAt: string | null;
  verifiedBy: string | null;
}

/**
 * The reference list, joined to the provider record behind it.
 *
 * The join is by DOI. A reference with no provider record is still shown — it
 * was verified, and dropping it would understate the bibliography — with the
 * fields only the provider knew left `null`.
 */
export function toLiveReferences(payload: LiteraturePayload): LiveReference[] {
  const papersByDoi = new Map<string, LiteraturePayload['papers'][number]>();
  for (const paper of payload.papers) {
    if (paper.doi) papersByDoi.set(paper.doi.toLowerCase(), paper);
  }

  return payload.references.map((reference: ReferenceRecord) => {
    const paper = reference.doi ? papersByDoi.get(reference.doi.toLowerCase()) : undefined;
    return {
      key: reference.key,
      title: reference.title,
      authors: reference.authors,
      year: reference.year,
      venue: reference.venue,
      doi: reference.doi,
      url: reference.url,
      volume: reference.volume,
      pages: reference.pages,
      publisher: reference.publisher,
      rank: paper?.rank ?? null,
      citationCount: paper?.citationCount ?? null,
      abstract: paper?.abstract ?? null,
      verifiedAt: reference.verified.verifiedAt,
      verifiedBy: reference.verified.provider,
    };
  });
}

/** One-line citation, rendered from fields only. */
export function formatReferenceLine(reference: LiveReference): string {
  const authors =
    reference.authors.length === 0
      ? 'Unknown authors'
      : reference.authors.length > 3
        ? `${reference.authors.slice(0, 3).join(', ')} et al.`
        : reference.authors.join(', ');
  const year = reference.year === null ? 'n.d.' : String(reference.year);
  const title = reference.title ?? 'Untitled (title not recorded)';
  const venue = reference.venue ? ` ${reference.venue}.` : '';
  const doi = reference.doi ? ` doi:${reference.doi}` : '';
  return `${authors} (${year}). ${title}.${venue}${doi}`;
}

/* ────────────────────────────────── CFD ──────────────────────────────────── */

export function isCfdPayload(payload: unknown): payload is CfdEvidencePayload {
  return isObject(payload) && payload['stage'] === 'evidence-generation';
}

export interface LiveCfd {
  quantity: string;
  unit: string;
  value: number;
  uncertainty: number;
  solver: 'su2' | 'synthetic';
  method: string;
  notes: string[];
  disclaimer: string | null;
  computedAt: string;
  gci: {
    levels: Array<{ level: string; cells: number; value: number }>;
    apparentOrder: number;
    fineGciPercent: number | null;
    mediumGciPercent: number | null;
    asymptoticRatio: number | null;
    valid: boolean;
    reason: string | null;
  } | null;
  artefacts: Array<{ name: string; sha256: string }>;
}

export function toLiveCfd(payload: CfdEvidencePayload): LiveCfd {
  return {
    quantity: payload.quantity,
    unit: payload.unit,
    value: payload.value,
    uncertainty: payload.uncertainty,
    solver: payload.solver,
    method: payload.method,
    notes: payload.notes,
    disclaimer: payload.disclaimer ?? null,
    computedAt: payload.computedAt,
    gci: payload.gci
      ? {
          levels: payload.gci.levels,
          apparentOrder: payload.gci.apparentOrder,
          fineGciPercent: payload.gci.fineGciPercent,
          mediumGciPercent: payload.gci.mediumGciPercent,
          asymptoticRatio: payload.gci.asymptoticRatio,
          valid: payload.gci.valid,
          reason: payload.gci.reason ?? null,
        }
      : null,
    artefacts: payload.artefacts,
  };
}

/* ───────────────────────────────── novelty ───────────────────────────────── */

export function isNoveltyPayload(payload: unknown): payload is NoveltyPayload {
  return isObject(payload) && payload['stage'] === 'novelty-detection';
}

export interface LiveGap {
  term: string;
  /** Always `null`: the API records coverage, not a novelty score. */
  noveltyScore: null;
  competitorRisk: null;
}

export function toLiveGaps(payload: NoveltyPayload): LiveGap[] {
  return payload.uncoveredTerms.map((term) => ({ term, noveltyScore: null, competitorRisk: null }));
}

/* ───────────────────────────────── manuscript ────────────────────────────── */

export function isManuscriptPayload(payload: unknown): payload is ManuscriptPayload {
  return isObject(payload) && payload['stage'] === 'paper-synthesis';
}

export interface LiveManuscript {
  title: string;
  journal: string;
  abstract: string;
  wordCount: number;
  synthetic: boolean;
  generatedAt: string;
  sections: Array<{ heading: string; body: string; words: number }>;
  references: ManuscriptPayload['references'];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function toLiveManuscript(payload: ManuscriptPayload): LiveManuscript {
  return {
    title: payload.title,
    journal: payload.journal,
    abstract: payload.abstract,
    wordCount: payload.wordCount,
    synthetic: payload.synthetic,
    generatedAt: payload.generatedAt,
    sections: payload.sections.map((section) => ({
      heading: section.heading,
      body: section.body,
      // Counted from the text on screen, so the number matches what is rendered.
      words: countWords(section.body),
    })),
    references: payload.references,
  };
}

/* ─────────────────────────────────── review ──────────────────────────────── */

export function isReviewPayload(payload: unknown): payload is ReviewPayload {
  return isObject(payload) && payload['stage'] === 'peer-review-council';
}

export interface LiveReview {
  manuscriptTitle: string;
  verdict: 'pass' | 'revise';
  reviewedAt: string;
  comments: ReviewPayload['comments'];
  checks: ReviewPayload['checks'];
  passedChecks: number;
}

export function toLiveReview(payload: ReviewPayload): LiveReview {
  return {
    manuscriptTitle: payload.manuscriptTitle,
    verdict: payload.verdict,
    reviewedAt: payload.reviewedAt,
    comments: payload.comments,
    checks: payload.checks,
    passedChecks: payload.checks.filter((check) => check.passed).length,
  };
}

/* ──────────────────────────────────── wiki ───────────────────────────────── */

/** A wiki article payload, validated field by field rather than by `as`. */
export function isWikiArticle(value: unknown): value is WikiPayload {
  return (
    isObject(value) &&
    value['stage'] === 'aerowiki-submission' &&
    typeof value['title'] === 'string' &&
    typeof value['markdown'] === 'string'
  );
}

/**
 * The wiki article inside a `submission-package` record.
 *
 * Stage 8 writes the article and the manifest in one append, so the article
 * arrives nested. A package whose `wiki` does not validate yields `null` —
 * reported as missing, never coerced into something renderable.
 */
export function wikiFromPackage(payload: unknown): WikiPayload | null {
  if (!isObject(payload)) return null;
  return isWikiArticle(payload['wiki']) ? payload['wiki'] : null;
}

/* ────────────────────────── rendered manuscript ─────────────────────────── */

export function isRenderPayload(payload: unknown): payload is ManuscriptRenderPayload {
  return isObject(payload) && payload['stage'] === 'manuscript-render';
}

export interface LiveRender {
  template: string;
  typeset: 'pdf' | 'source-only';
  files: ManuscriptRenderPayload['files'];
  pdf: { sha256: string; bytes: number } | null;
  toolchain: { binary: string; version: string | null } | null;
  missingBibliographyFields: string[];
  generatedAt: string;
  /** One sentence saying what exists, and what does not. */
  summary: string;
}

export function toLiveRender(payload: ManuscriptRenderPayload): LiveRender {
  const summary =
    payload.typeset === 'pdf'
      ? `Typeset to PDF with ${payload.toolchain?.version ?? 'a TeX engine'} using the ${payload.template} template.`
      : `LaTeX source only (${payload.template} template). The .tex compiles by hand; this instance had no TeX engine, so no PDF exists.`;
  return {
    template: payload.template,
    typeset: payload.typeset,
    files: payload.files,
    pdf: payload.pdf,
    toolchain: payload.toolchain,
    missingBibliographyFields: payload.missingBibliographyFields,
    generatedAt: payload.generatedAt,
    summary,
  };
}

/* ──────────────────────────── reference re-checks ────────────────────────── */

export function isRecheckPayload(payload: unknown): payload is DoiRecheckPayload {
  return isObject(payload) && payload['stage'] === 'reference-recheck';
}

export interface LiveRecheck {
  checkedAt: string;
  offline: boolean;
  maxAgeDays: number;
  summary: DoiRecheckSummary;
  results: RecheckResult[];
  /**
   * One line saying what the check can and cannot support.
   *
   * An offline check resolved nothing, so it is never described as having
   * verified a DOI — the same rule the API applies to its own reasons.
   */
  headline: string;
}

export function toLiveRecheck(payload: DoiRecheckPayload): LiveRecheck {
  const { summary } = payload;
  const failed = summary.broken + summary.mismatch;
  const doiNoun = summary.total === 1 ? 'DOI' : 'DOIs';
  const referenceNoun = summary.total === 1 ? 'reference' : 'references';
  let headline: string;
  if (payload.offline) {
    headline = `Checked offline: no DOI was resolved, so no reference is confirmed (${summary.total} checked).`;
  } else if (failed > 0) {
    headline = `${failed} of ${summary.total} ${doiNoun} no longer match ${summary.total === 1 ? 'its' : 'their'} stored reference.`;
  } else {
    headline = `${summary.total} ${referenceNoun} checked: ${summary.fresh} fresh, ${summary.stale} stale, ${summary.unverified} unverified.`;
  }
  return {
    checkedAt: payload.checkedAt,
    offline: payload.offline,
    maxAgeDays: payload.maxAgeDays,
    summary,
    results: payload.results,
    headline,
  };
}

/** Markdown is rendered as text: the app has no HTML-injection path. */
export function toLiveWiki(payload: WikiPayload): {
  title: string;
  markdown: string;
  slug: string;
} {
  return { title: payload.title, markdown: payload.markdown, slug: payload.slug };
}
