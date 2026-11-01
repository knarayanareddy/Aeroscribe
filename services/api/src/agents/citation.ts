import type { CitationStyle, ReferenceRecord, RenderedCitation } from '@aeroscribe/contract';

/**
 * AIAA citation formatting — RULE-032.
 *
 * Three forms, one rule: a field the reference record does not carry is
 * **omitted and listed**, never printed as a blank, an ellipsis or a plausible
 * guess. A citation that says `Vol. 62` knows the volume; one that says
 * `Vol. ,` knows nothing and pretends otherwise.
 *
 * `formatAiaa` and `parseAiaa` are written as a pair on purpose: stage 5
 * formats every reference, parses the result back and compares the fields that
 * went in. A formatter nobody can invert is a formatter whose output nothing
 * checks.
 */

export interface FormattedCitation {
  text: string;
  style: CitationStyle;
  /** Fields this form prints that the record does not carry. */
  missing: string[];
}

export interface ParsedCitation {
  index: number;
  authors: string[];
  /** True when the printed list ended in `et al.`. */
  truncated: boolean;
  title: string | null;
  venue: string | null;
  volume: string | null;
  issue: string | null;
  year: number | null;
  pages: string | null;
  publisher: string | null;
  doi: string | null;
}

/**
 * Fields an AIAA form cannot be constructed without.
 *
 * Volume, issue and pages are *optional*: AIAA's forms print whichever exist,
 * and a preprint has no volume to print. Their absence is reported in `missing`
 * and reaches the compliance report as a minor issue, not as an incomplete
 * citation — the difference between "this reference is thinner than ideal" and
 * "this reference cannot be typeset".
 */
const REQUIRED: Record<Exclude<CitationStyle, 'incomplete'>, string[]> = {
  'aiaa-journal': ['authors', 'title', 'year', 'venue'],
  'aiaa-conference': ['authors', 'title', 'year', 'venue', 'publisher'],
  'aiaa-book': ['authors', 'title', 'year', 'publisher'],
};

/** A venue that names a meeting rather than a journal. */
const CONFERENCE_VENUE =
  /proceedings|conference|symposium|congress|meeting|workshop|colloquium|forum|exposition|scitech/i;

/** Strip a `doi:` prefix, a resolver URL and trailing slashes, keeping case. */
export function displayDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/\/+$/, '');
}

/** Compare DOIs the way a resolver does: case-insensitively, ignoring a trailing slash. */
export function sameDoi(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return a === b || (!a && !b);
  return displayDoi(a).toLowerCase() === displayDoi(b).toLowerCase();
}

/** `1201-1215` as AIAA prints it, `1201–1215`; a single page is unchanged. */
function pageRange(pages: string): string {
  return pages.replace(/(\d)\s*[-–]\s*(\d)/g, '$1\u2013$2');
}

/** Recover the recorded spelling of a printed page range. */
function recordedPages(pages: string): string {
  return pages.replace(/(\d)\s*[–-]\s*(\d)/g, '$1-$2').trim();
}

/** Author list in AIAA order, with `et al.` past the third name. */
export function formatAuthorList(authors: readonly string[]): string {
  if (authors.length === 0) return '';
  if (authors.length > 3) return `${authors.slice(0, 3).join(', ')} et al.`;
  if (authors.length === 1) return authors[0]!;
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  return `${authors[0]}, ${authors[1]}, and ${authors[2]}`;
}

/** Split a printed author list back into names; `et al.` is reported, not dropped. */
export function parseAuthorList(text: string): { authors: string[]; truncated: boolean } {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const truncated = /\bet\s+al\.?$/.test(cleaned);
  const body = cleaned
    .replace(/[,\s]*\bet\s+al\.?$/, '')
    .replace(/,\s*$/, '')
    .trim();
  if (body.length === 0) return { authors: [], truncated };
  const authors = body
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return { authors, truncated };
}

/** Which AIAA form this record is set in. Pure function of the fields it carries. */
export function styleFor(reference: ReferenceRecord): CitationStyle {
  if (reference.publisher !== null && reference.venue === null) return 'aiaa-book';
  if (reference.venue !== null) {
    return CONFERENCE_VENUE.test(reference.venue) ? 'aiaa-conference' : 'aiaa-journal';
  }
  return 'incomplete';
}

function missingFor(reference: ReferenceRecord, style: CitationStyle): string[] {
  const missing: string[] = [];
  const has = {
    authors: reference.authors.length > 0,
    title: reference.title !== null,
    year: reference.year !== null,
    venue: reference.venue !== null,
    publisher: reference.publisher !== null,
  };
  // A record no form can be built for has to say which of the core fields are
  // absent — that is what makes the compliance issue actionable.
  const required: string[] =
    style === 'incomplete' ? ['authors', 'title', 'year', 'venue'] : REQUIRED[style];
  for (const field of required) {
    if (!has[field as keyof typeof has]) missing.push(field);
  }
  // Optional fields, listed so a reader knows why the form is shorter.
  if (style !== 'aiaa-book' && reference.volume === null) missing.push('volume');
  if (reference.issue === null || reference.issue === undefined) missing.push('issue');
  if (reference.pages === null) missing.push('pages');
  if (reference.doi === null) missing.push('doi');
  if (style === 'aiaa-book') missing.push('city');
  return [...new Set(missing)];
}

/**
 * Render one reference in AIAA form.
 *
 * The index prefix is the citation marker itself, so the string stage 7's
 * `[n]` check inspects is the string the formatter produced.
 */
export function formatAiaa(reference: ReferenceRecord): FormattedCitation {
  const style = styleFor(reference);
  const missing = missingFor(reference, style);

  const authors = formatAuthorList(reference.authors);
  const tail: string[] = [];
  if (reference.venue) tail.push(reference.venue);
  if (reference.volume) tail.push(`Vol. ${reference.volume}`);
  if (reference.issue) tail.push(`No. ${reference.issue}`);
  if (style === 'aiaa-conference' || style === 'aiaa-book') {
    if (reference.publisher) tail.push(reference.publisher);
  }
  if (reference.year !== null) tail.push(String(reference.year));
  if (reference.pages) tail.push(`pp. ${pageRange(reference.pages)}`);

  const body = assemble({ authors, title: reference.title, tail, style });
  const withDoi = reference.doi === null ? `${body}.` : `${body}. doi:${displayDoi(reference.doi)}`;

  return { text: `[${reference.index}] ${withDoi}`, style, missing };
}

/**
 * Join the parts of one citation.
 *
 * The article forms set the comma *inside* the closing quotation mark, so the
 * title is followed by a space rather than by `", "`. Getting this wrong prints
 * `"Title,", Journal`, which is the kind of detail a copy-editor returns.
 */
function assemble(input: {
  authors: string;
  title: string | null;
  tail: string[];
  style: CitationStyle;
}): string {
  const { authors, title, tail, style } = input;
  if (title === null) {
    const parts = [authors, ...tail].filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(', ') : NO_FIELDS;
  }
  if (style === 'aiaa-book') {
    return [authors, title, ...tail].filter((part) => part.length > 0).join(', ');
  }
  const quoted = `"${title},"`;
  const head = authors.length > 0 ? `${authors}, ${quoted}` : quoted;
  // The tail keeps its commas; only the title is separated by a space, because
  // its comma lives inside the quotation marks.
  return tail.length > 0 ? `${head} ${tail.join(', ')}` : head;
}

/** Printed when a record carries nothing at all; the compliance check escalates it. */
const NO_FIELDS = '(no bibliographic fields recorded)';

/** The contract's record of what the formatter did, for the manuscript payload. */
export function renderedCitation(reference: ReferenceRecord): RenderedCitation {
  const formatted = formatAiaa(reference);
  return { key: reference.key, style: formatted.style, missing: formatted.missing };
}

/* ────────────────────────────── the inverse ──────────────────────────────── */

/** A segment that looks like a personal name: no digits, capitalised, few words. */
const NAME_LIKE = /^[A-Z][\p{L}'’.-]*(?:\s+[\p{L}'’.-]+){0,4}$/u;
const FUNCTION_WORD = /\b(?:of|the|for|on|in|to|at|with|from)\b/i;

function looksLikeName(segment: string): boolean {
  return NAME_LIKE.test(segment) && !FUNCTION_WORD.test(segment) && !/\d/.test(segment);
}

function splitSegments(text: string): string[] {
  return text
    .split(', ')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function emptyParsed(index: number, doi: string | null): ParsedCitation {
  return {
    index,
    authors: [],
    truncated: false,
    title: null,
    venue: null,
    volume: null,
    issue: null,
    year: null,
    pages: null,
    publisher: null,
    doi,
  };
}

/**
 * Parse a citation this module produced.
 *
 * This is a validator, not a general-purpose reference parser: it understands
 * the grammar `formatAiaa` emits — a bracketed index, a quoted article title or
 * an unquoted book title, and the labelled `Vol.`/`No.`/`pp.`/`doi:` segments.
 * A string it cannot parse returns `null`, and stage 5 turns that into a
 * failure; guessing would turn a formatting bug into a wrong citation.
 */
export function parseAiaa(text: string): ParsedCitation | null {
  const head = /^\[(\d+)\]\s+(.+)$/s.exec(text.trim());
  if (!head) return null;

  const index = Number.parseInt(head[1]!, 10);
  let body = head[2]!.trim();

  let doi: string | null = null;
  const doiMatch = /\s+doi:\s*(\S+)\s*$/.exec(body);
  if (doiMatch) {
    doi = displayDoi(doiMatch[1]!);
    body = body.slice(0, doiMatch.index);
  }
  body = body.replace(/\.\s*$/, '').trim();
  if (body.length === 0) return emptyParsed(index, doi);

  let authors: string[] = [];
  let truncated = false;
  let title: string | null = null;
  let year: number | null = null;
  let pages: string | null = null;
  let volume: string | null = null;
  let issue: string | null = null;

  const quoted = /^([^"]*)"([^"]*)"\s*(.*)$/s.exec(body);
  const segments = splitSegments(quoted ? (quoted[3] ?? '') : body);

  if (quoted) {
    ({ authors, truncated } = parseAuthorList(quoted[1]!.replace(/,\s*$/, '').trim()));
    title = quoted[2]!.replace(/[,\s]+$/, '').trim();
  }

  // Labelled segments are recognised wherever they sit; everything else keeps
  // its printed order, which is what the forms rely on.
  const unlabelled: string[] = [];
  for (const segment of segments) {
    const cleaned = segment.replace(/[.,]\s*$/, '').trim();
    if (/^Vol\.\s+/.test(cleaned)) volume = cleaned.replace(/^Vol\.\s+/, '');
    else if (/^No\.\s+/.test(cleaned)) issue = cleaned.replace(/^No\.\s+/, '');
    else if (/^pp?\.\s+/.test(cleaned)) pages = recordedPages(cleaned.replace(/^pp?\.\s+/, ''));
    else if (/^\d{4}$/.test(cleaned)) year = Number.parseInt(cleaned, 10);
    else unlabelled.push(cleaned);
  }

  let venue: string | null = null;
  let publisher: string | null = null;

  if (quoted) {
    venue = unlabelled[0] ?? null;
    publisher = unlabelled[1] ?? null;
  } else {
    // Book form: `Authors, Title, Publisher, YYYY, pp. P–P`. The author list is
    // the leading run of name-shaped segments; the title follows it.
    let split = 0;
    while (split < unlabelled.length && looksLikeName(unlabelled[split]!)) split += 1;
    if (split === 0) return null;
    ({ authors, truncated } = parseAuthorList(unlabelled.slice(0, split).join(', ')));
    title = unlabelled[split] ?? null;
    publisher = unlabelled[split + 1] ?? null;
  }

  return {
    index,
    authors,
    truncated,
    title: title !== null && title.length > 0 ? title : null,
    venue,
    volume,
    issue,
    year,
    pages,
    publisher,
    doi,
  };
}

/* ─────────────────────────── the round-trip check ────────────────────────── */

export interface CitationValidation {
  ok: boolean;
  /** One line per field that did not survive formatting and parsing. */
  problems: string[];
}

function compare(
  problems: string[],
  label: string,
  expected: string | null,
  actual: string | null,
): void {
  if ((expected ?? '') !== (actual ?? '')) {
    problems.push(
      `${label}: recorded ${JSON.stringify(expected)}, re-read ${JSON.stringify(actual)}`,
    );
  }
}

/**
 * Format every reference, parse it back, and report every field that was lost.
 *
 * Fields a form does not print for its style are not compared — the point is to
 * catch a *formatter* bug (a dropped volume, a swallowed page range), not to
 * pretend the AIAA journal form carries a publisher. A record the formatter
 * called `incomplete` is skipped here and reported by stage 7 instead: there is
 * no full form to lose fields from.
 */
export function validateCitations(references: readonly ReferenceRecord[]): CitationValidation {
  const problems: string[] = [];

  for (const reference of references) {
    const formatted = formatAiaa(reference);
    if (formatted.style === 'incomplete') continue;

    const parsed = parseAiaa(formatted.text);
    if (!parsed) {
      problems.push(`${reference.key}: the formatted citation could not be parsed back`);
      continue;
    }
    if (parsed.index !== reference.index) {
      problems.push(`${reference.key}: index ${reference.index} was printed as ${parsed.index}`);
    }

    const style = formatted.style;
    compare(
      problems,
      `${reference.key} authors`,
      formatAuthorList(reference.authors.slice(0, 3)),
      formatAuthorList(parsed.authors),
    );
    if (reference.authors.length > 3 && !parsed.truncated) {
      problems.push(`${reference.key}: the "et al." marker was lost`);
    }
    compare(problems, `${reference.key} title`, reference.title, parsed.title);
    compare(
      problems,
      `${reference.key} year`,
      reference.year === null ? null : String(reference.year),
      parsed.year === null ? null : String(parsed.year),
    );
    if (style === 'aiaa-journal' || style === 'aiaa-conference') {
      compare(problems, `${reference.key} venue`, reference.venue, parsed.venue);
    }
    if (style === 'aiaa-journal') {
      compare(problems, `${reference.key} volume`, reference.volume, parsed.volume);
      compare(problems, `${reference.key} issue`, reference.issue ?? null, parsed.issue);
    }
    if (style === 'aiaa-conference' || style === 'aiaa-book') {
      compare(problems, `${reference.key} publisher`, reference.publisher, parsed.publisher);
    }
    compare(
      problems,
      `${reference.key} pages`,
      reference.pages === null ? null : recordedPages(reference.pages),
      parsed.pages,
    );
    if (reference.doi !== null && !sameDoi(reference.doi, parsed.doi)) {
      problems.push(
        `${reference.key} doi: recorded ${JSON.stringify(reference.doi)}, re-read ${JSON.stringify(parsed.doi)}`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}
