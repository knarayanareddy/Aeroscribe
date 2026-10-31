// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  missingFields,
  readReferences,
  referenceKey,
  referenceLabel,
  toReferenceRecord,
  type ReferenceRecord,
} from '../src/literature';
import type { Paper } from '../src/literature';

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: 'crossref:10.2514/1.j060000',
    source: 'crossref',
    title: 'Drag prediction on unstructured meshes',
    authors: ['A. Author', 'B. Author'],
    year: 2024,
    doi: '10.2514/1.j060000',
    url: 'https://doi.org/10.2514/1.j060000',
    abstract: 'An abstract.',
    citationCount: 12,
    ...overrides,
  };
}

describe('toReferenceRecord', () => {
  it('carries the bibliographic fields a citation style needs', () => {
    const record = toReferenceRecord({
      paper: paper({
        containerTitle: 'AIAA Journal',
        volume: '62',
        pages: '1201-1215',
        publisher: 'AIAA',
      }),
      index: 1,
      verification: {
        verifiedAt: '2026-10-31T10:00:00.000Z',
        provider: 'crossref',
        titleSimilarity: 1,
      },
    });

    expect(record).toMatchObject({
      key: 'ref-01',
      index: 1,
      title: 'Drag prediction on unstructured meshes',
      venue: 'AIAA Journal',
      volume: '62',
      pages: '1201-1215',
      publisher: 'AIAA',
      verified: {
        verifiedAt: '2026-10-31T10:00:00.000Z',
        provider: 'crossref',
        titleSimilarity: 1,
      },
    });
    expect(record.legacy).toBeUndefined();
  });

  it('leaves absent fields absent instead of deriving them', () => {
    const record = toReferenceRecord({ paper: paper(), index: 2 });

    // The DOI encodes a registrant, not a volume; the year is not a page range.
    expect(record.volume).toBeNull();
    expect(record.pages).toBeNull();
    expect(record.publisher).toBeNull();
    expect(record.venue).toBeNull();
    expect(record.verified).toEqual({
      verifiedAt: null,
      provider: null,
      titleSimilarity: null,
    });
    expect(missingFields(record)).toEqual(['venue']);
  });

  it('names arXiv as the venue only because arXiv is where the work lives', () => {
    const record = toReferenceRecord({
      paper: paper({ source: 'arxiv', containerTitle: null, doi: null, year: null }),
      index: 1,
    });

    expect(record.venue).toBe('arXiv preprint');
    expect(record.year).toBeNull();
    expect(missingFields(record)).toEqual(['year', 'doi']);
  });

  it('keeps a whitespace-only title explicitly absent', () => {
    const record = toReferenceRecord({ paper: paper({ title: '   ' }), index: 1 });
    expect(record.title).toBeNull();
    expect(referenceLabel(record)).toBe('DOI 10.2514/1.j060000');
  });

  it('zero-pads keys so lexical order is citation order', () => {
    expect(referenceKey(1)).toBe('ref-01');
    expect(referenceKey(12)).toBe('ref-12');
    expect([referenceKey(2), referenceKey(10)].sort()).toEqual(['ref-02', 'ref-10']);
  });
});

describe('readReferences', () => {
  const v2: ReferenceRecord = toReferenceRecord({ paper: paper(), index: 1 });

  it('reads a v2 payload unchanged', () => {
    expect(readReferences({ references: [v2] })).toEqual([v2]);
  });

  it('upgrades a v1 payload without inventing a title from the citation string', () => {
    const upgraded = readReferences({
      references: [
        { index: 1, citation: '[1] A. Author (2024). A Title. doi:10.1/x', doi: '10.1/x' },
      ],
    });

    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]).toMatchObject({
      key: 'ref-01',
      doi: '10.1/x',
      title: null,
      legacy: true,
      verified: { verifiedAt: null, provider: null, titleSimilarity: null },
    });
    expect(upgraded[0]!.authors).toEqual([]);
  });

  it('sorts by index and skips entries it cannot interpret', () => {
    const records = readReferences({
      references: [
        { ...v2, index: 3, key: 'ref-03' },
        'not a record',
        null,
        { ...v2, index: 1, key: 'ref-01' },
      ],
    });

    expect(records.map((record) => record.index)).toEqual([1, 3]);
  });

  it('returns an empty list for a payload with no references', () => {
    expect(readReferences(undefined)).toEqual([]);
    expect(readReferences({})).toEqual([]);
    expect(readReferences({ references: 'nope' })).toEqual([]);
  });
});

describe('missingFields', () => {
  it('lists only what a citation would have to leave out', () => {
    const full = toReferenceRecord({
      paper: paper({ containerTitle: 'AIAA Journal' }),
      index: 1,
    });
    expect(missingFields(full)).toEqual([]);

    const sparse = toReferenceRecord({
      paper: paper({ authors: [], year: null, containerTitle: null, doi: null }),
      index: 1,
    });
    expect(missingFields(sparse)).toEqual(['authors', 'year', 'venue', 'doi']);
  });
});
