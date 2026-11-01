// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ReferenceRecord } from '@aeroscribe/contract';
import {
  displayDoi,
  formatAiaa,
  formatAuthorList,
  parseAiaa,
  parseAuthorList,
  renderedCitation,
  sameDoi,
  styleFor,
  validateCitations,
} from '../src/agents/citation';

/**
 * AIAA citations (RULE-032).
 *
 * Three forms, one rule: a field the record does not carry is omitted and
 * listed. The round-trip tests are the interesting ones — a formatter nobody can
 * invert is a formatter whose output nothing checks.
 */

function reference(overrides: Partial<ReferenceRecord> = {}): ReferenceRecord {
  return {
    key: 'ref-01',
    index: 1,
    doi: '10.2514/1.J060001',
    title: 'Transonic drag prediction on unstructured meshes',
    authors: ['A. Author', 'B. Author'],
    year: 2024,
    venue: 'AIAA Journal',
    volume: '62',
    issue: '3',
    pages: '1201-1215',
    publisher: 'AIAA',
    url: 'https://doi.org/10.2514/1.J060001',
    verified: { verifiedAt: '2026-11-01T00:00:00.000Z', provider: 'crossref', titleSimilarity: 1 },
    ...overrides,
  };
}

describe('formatAiaa', () => {
  it('sets a journal article in the AIAA journal form', () => {
    expect(formatAiaa(reference())).toEqual({
      text: '[1] A. Author and B. Author, "Transonic drag prediction on unstructured meshes," AIAA Journal, Vol. 62, No. 3, 2024, pp. 1201\u20131215. doi:10.2514/1.J060001',
      style: 'aiaa-journal',
      missing: [],
    });
  });

  it('sets a conference paper with its proceedings and publisher', () => {
    const formatted = formatAiaa(
      reference({
        venue: 'Proceedings of the AIAA Aviation Forum',
        volume: null,
        issue: null,
        publisher: 'AIAA',
      }),
    );
    expect(formatted.style).toBe('aiaa-conference');
    expect(formatted.text).toBe(
      '[1] A. Author and B. Author, "Transonic drag prediction on unstructured meshes," Proceedings of the AIAA Aviation Forum, AIAA, 2024, pp. 1201\u20131215. doi:10.2514/1.J060001',
    );
  });

  it('sets a book without quotation marks around the title', () => {
    const formatted = formatAiaa(
      reference({
        venue: null,
        volume: null,
        issue: null,
        pages: null,
        publisher: 'Academic Press',
        title: 'Computational fluid dynamics',
      }),
    );
    expect(formatted.style).toBe('aiaa-book');
    expect(formatted.text).toBe(
      '[1] A. Author and B. Author, Computational fluid dynamics, Academic Press, 2024. doi:10.2514/1.J060001',
    );
    // The city an AIAA book entry prints is not something the record carries, so
    // the form says so instead of inventing "Reston, VA".
    expect(formatted.missing).toContain('city');
  });

  it('omits a missing volume and a missing page range, and lists both', () => {
    const formatted = formatAiaa(reference({ volume: null, pages: null, issue: null }));
    expect(formatted.text).toBe(
      '[1] A. Author and B. Author, "Transonic drag prediction on unstructured meshes," AIAA Journal, 2024. doi:10.2514/1.J060001',
    );
    expect(formatted.missing).toEqual(expect.arrayContaining(['volume', 'issue', 'pages']));
  });

  it('collapses four or more authors to three and "et al."', () => {
    const formatted = formatAiaa(
      reference({ authors: ['A. One', 'B. Two', 'C. Three', 'D. Four', 'E. Five'] }),
    );
    expect(formatted.text.startsWith('[1] A. One, B. Two, C. Three et al.,')).toBe(true);
    expect(formatted.text).not.toContain('D. Four');
  });

  it('keeps Unicode names as recorded', () => {
    const formatted = formatAiaa(reference({ authors: ['Jürgen Müller', 'Ana Ñúñez'] }));
    expect(formatted.text.startsWith('[1] Jürgen Müller and Ana Ñúñez,')).toBe(true);
  });

  it('prints a DOI without a trailing slash and without a resolver prefix', () => {
    const formatted = formatAiaa(reference({ doi: 'https://doi.org/10.2514/1.J060001/' }));
    expect(formatted.text).toMatch(/doi:10\.2514\/1\.J060001$/);
    expect(formatted.text).not.toContain('doi.org');
  });

  it('marks a record it cannot set in any form as incomplete, listing what is missing', () => {
    const legacy = reference({
      title: null,
      authors: [],
      year: null,
      venue: null,
      volume: null,
      issue: null,
      pages: null,
      publisher: null,
      doi: null,
      legacy: true,
    });
    const formatted = formatAiaa(legacy);
    expect(formatted.style).toBe('incomplete');
    expect(formatted.missing).toEqual(
      expect.arrayContaining(['authors', 'title', 'year', 'venue', 'doi']),
    );
    // Whatever it does print, it prints the index the manuscript cites.
    expect(formatted.text.startsWith('[1] ')).toBe(true);
  });

  it('prints nothing but a clear statement when the record is empty', () => {
    const empty = reference({
      title: null,
      authors: [],
      year: null,
      venue: null,
      volume: null,
      issue: null,
      pages: null,
      publisher: null,
      doi: null,
    });
    expect(formatAiaa(empty).text).toBe('[1] (no bibliographic fields recorded).');
  });

  it('records what the formatter did, in the shape the payload stores', () => {
    expect(renderedCitation(reference({ volume: null }))).toEqual({
      key: 'ref-01',
      style: 'aiaa-journal',
      missing: expect.arrayContaining(['volume']),
    });
  });
});

describe('styleFor', () => {
  it('reads the form off the fields that are present', () => {
    expect(styleFor(reference())).toBe('aiaa-journal');
    expect(styleFor(reference({ venue: 'AIAA SciTech Forum and Exposition' }))).toBe(
      'aiaa-conference',
    );
    expect(styleFor(reference({ venue: null }))).toBe('aiaa-book');
    expect(styleFor(reference({ venue: null, publisher: null }))).toBe('incomplete');
  });
});

describe('parseAiaa', () => {
  it('recovers every field the journal form prints', () => {
    const parsed = parseAiaa(formatAiaa(reference()).text)!;
    expect(parsed).toMatchObject({
      index: 1,
      authors: ['A. Author', 'B. Author'],
      truncated: false,
      title: 'Transonic drag prediction on unstructured meshes',
      venue: 'AIAA Journal',
      volume: '62',
      issue: '3',
      year: 2024,
      pages: '1201-1215',
      doi: '10.2514/1.J060001',
    });
  });

  it('recovers an et al. list as three names plus its marker', () => {
    const formatted = formatAiaa(
      reference({ authors: ['A. One', 'B. Two', 'C. Three', 'D. Four'] }),
    );
    expect(parseAiaa(formatted.text)).toMatchObject({
      authors: ['A. One', 'B. Two', 'C. Three'],
      truncated: true,
    });
  });

  it('recovers a book title that is not quoted', () => {
    const formatted = formatAiaa(
      reference({
        venue: null,
        volume: null,
        issue: null,
        pages: null,
        publisher: 'Academic Press',
      }),
    );
    expect(parseAiaa(formatted.text)).toMatchObject({
      authors: ['A. Author', 'B. Author'],
      title: 'Transonic drag prediction on unstructured meshes',
      publisher: 'Academic Press',
      year: 2024,
      doi: '10.2514/1.J060001',
    });
  });

  it('returns null for text it did not write, instead of guessing', () => {
    expect(parseAiaa('Author, A. (2024). Title. Journal.')).toBeNull();
    expect(parseAiaa('[1]')).toBeNull();
    expect(parseAiaa('')).toBeNull();
  });
});

describe('validateCitations', () => {
  it('round-trips every form the formatter produces', () => {
    const references = [
      reference(),
      reference({ index: 2, key: 'ref-02', venue: 'Proceedings of the AIAA Aviation Forum' }),
      reference({ index: 3, key: 'ref-03', venue: null }),
      reference({ index: 4, key: 'ref-04', pages: '9' }),
      reference({ index: 5, key: 'ref-05', doi: '10.2514/1.J060001/' }),
    ];
    expect(validateCitations(references)).toEqual({ ok: true, problems: [] });
  });

  it('reports a field the round trip loses', () => {
    // A name with a comma inside it cannot survive a comma-separated author
    // list. The validator says so instead of letting the citation be wrong.
    const report = validateCitations([reference({ authors: ['Smith, John', 'B. Author'] })]);
    expect(report.ok).toBe(false);
    expect(report.problems.join(' ')).toMatch(/ref-01 authors/);
  });

  it('does not pretend an incomplete record lost fields', () => {
    const legacy = reference({
      title: null,
      authors: [],
      year: null,
      venue: null,
      volume: null,
      issue: null,
      pages: null,
      publisher: null,
      doi: null,
    });
    expect(validateCitations([legacy])).toEqual({ ok: true, problems: [] });
  });
});

describe('small helpers', () => {
  it('formats an author list in AIAA order', () => {
    expect(formatAuthorList([])).toBe('');
    expect(formatAuthorList(['A. One'])).toBe('A. One');
    expect(formatAuthorList(['A. One', 'B. Two'])).toBe('A. One and B. Two');
    expect(formatAuthorList(['A. One', 'B. Two', 'C. Three'])).toBe('A. One, B. Two, and C. Three');
    expect(formatAuthorList(['A. One', 'B. Two', 'C. Three', 'D. Four'])).toBe(
      'A. One, B. Two, C. Three et al.',
    );
  });

  it('inverts the author list', () => {
    expect(parseAuthorList('A. One and B. Two')).toEqual({
      authors: ['A. One', 'B. Two'],
      truncated: false,
    });
    expect(parseAuthorList('A. One, B. Two, and C. Three')).toEqual({
      authors: ['A. One', 'B. Two', 'C. Three'],
      truncated: false,
    });
    expect(parseAuthorList('A. One, B. Two, C. Three et al.')).toEqual({
      authors: ['A. One', 'B. Two', 'C. Three'],
      truncated: true,
    });
  });

  it('compares DOIs the way a resolver does', () => {
    expect(sameDoi('10.2514/1.J060001', 'https://doi.org/10.2514/1.j060001')).toBe(true);
    expect(sameDoi('10.2514/1.J060001/', '10.2514/1.J060001')).toBe(true);
    expect(sameDoi('10.2514/1.J060001', '10.2514/1.J060002')).toBe(false);
    expect(displayDoi('doi:10.2514/1.J060001//')).toBe('10.2514/1.J060001');
  });
});
