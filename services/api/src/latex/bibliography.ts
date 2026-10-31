import type { ReferenceRecord } from '@aeroscribe/contract';
import { escapeLatex } from './escape';

/**
 * BibTeX from the structured reference records (P1).
 *
 * The rule from `literature/reference.ts` carries over: a field the record does
 * not have is **omitted**, never filled in. The `.bib` says which fields were
 * left out in a comment above the entry, so a reviewer can see the difference
 * between "the journal does not print volumes" and "we lost the volume".
 */

/** Fields whose absence the comment reports; venue decides the entry type. */
const OPTIONAL_FIELDS = ['volume', 'pages', 'publisher'] as const;

export interface Bibliography {
  /** The complete `.bib` file. */
  bib: string;
  /** Distinct field names that at least one entry could not carry. */
  missing: string[];
}

/**
 * Escape a value for a BibTeX field.
 *
 * Braces are left alone on purpose: BibTeX counts them, so `\{` would make the
 * file unparseable. `\`, `%`, `&`, `#`, `$`, `_` still need escaping.
 */
export function bibValue(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([%&#$_])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function authors(record: ReferenceRecord): string | null {
  const names = record.authors.map((author) => author.trim()).filter((name) => name.length > 0);
  if (names.length === 0) return null;
  // The records store display names ("A. Author"), which is what BibTeX prints
  // in a `plainnat` style: no name is split into first/last parts.
  return names.map((name) => `{${bibValue(name)}}`).join(' and ');
}

/** One entry, with a `% missing:` comment naming what the record lacked. */
export function bibliographyEntry(record: ReferenceRecord): { entry: string; missing: string[] } {
  const fields: Array<[string, string | null]> = [
    ['title', record.title === null ? null : bibValue(record.title)],
    ['author', authors(record)],
    ['year', record.year === null ? null : String(record.year)],
    ['journal', record.venue === null ? null : bibValue(record.venue)],
    ['volume', record.volume === null ? null : bibValue(record.volume)],
    ['pages', record.pages === null ? null : bibValue(record.pages)],
    ['publisher', record.publisher === null ? null : bibValue(record.publisher)],
    ['doi', record.doi === null ? null : bibValue(record.doi)],
    ['url', record.url === null ? null : bibValue(record.url)],
  ];

  const present = fields.filter(([, value]) => value !== null) as Array<[string, string]>;
  const missing = OPTIONAL_FIELDS.filter((name) =>
    fields.some(([field, value]) => field === name && value === null),
  );

  // A venue makes it an article; without one the record is a preprint or a
  // miscellany, and BibTeX should say so rather than invent a journal.
  const type = record.venue === null ? 'misc' : 'article';
  const body = present.map(([name, value]) => `  ${name} = {${value}}`).join(',\n');

  const comment =
    missing.length > 0 ? `% missing: ${missing.join(', ')} — the record has no such field\n` : '';

  return {
    entry: `${comment}@${type}{${record.key},\n${body}\n}\n`,
    missing,
  };
}

/**
 * One reference as prose, for the `thebibliography` environment.
 *
 * The `.tex` embeds its bibliography instead of asking BibTeX to build it: the
 * document then compiles with `pdflatex` alone, twice, which is the contract
 * `compile.ts` implements. `references.bib` is still written, because a journal
 * will want it — both come from the same records, so they cannot disagree.
 */
export function citationText(record: ReferenceRecord): string {
  const parts: string[] = [];
  const names = record.authors.filter((name) => name.trim().length > 0);
  if (names.length > 0) parts.push(names.map(escapeLatex).join(', '));
  if (record.title !== null) parts.push(`\textit{${escapeLatex(record.title)}}`);
  if (record.venue !== null) parts.push(escapeLatex(record.venue));
  if (record.volume !== null) parts.push(`vol. ${escapeLatex(record.volume)}`);
  if (record.pages !== null) parts.push(`pp. ${escapeLatex(record.pages)}`);
  if (record.publisher !== null) parts.push(escapeLatex(record.publisher));
  if (record.year !== null) parts.push(String(record.year));
  // `\ ` is LaTeX's explicit space; a plain space after `:` is absorbed by the
  // engine's punctuation rules in some cases, the escaped one never is.
  if (record.doi !== null) parts.push(`doi:\\ ${escapeLatex(record.doi)}`);
  return `${parts.join(', ')}.`;
}

/** The whole bibliography, in the manuscript's reference order. */
export function bibliographyFrom(records: readonly ReferenceRecord[]): Bibliography {
  const entries = records.map(bibliographyEntry);
  const missing = Array.from(new Set(entries.flatMap((entry) => entry.missing))).sort();
  return {
    bib: [
      '%% References rendered from the manuscript record by @aeroscribe/api.',
      '%% A field the record does not carry is absent below, not guessed.',
      '',
      ...entries.map((entry) => entry.entry),
    ].join('\n'),
    missing,
  };
}
