import { describe, expect, it } from 'vitest';
import type { Paper } from '@aeroscribe/pipeline';
import { allTags, filterPapers } from './literature';

const papers: Paper[] = [
  {
    id: 'p1',
    title: 'Rotating Detonation Engine Stability',
    authors: 'Nakamura, T.',
    journal: 'J. Propulsion and Power',
    year: 2023,
    doi: '10.2514/1.B39012',
    relevanceScore: 9.1,
    citationCount: 41,
    abstract: '…',
    tags: ['RDE', 'combustion'],
  },
  {
    id: 'p2',
    title: 'CFD of Multi-Wave RDE',
    authors: 'Liu, Y.',
    journal: 'AIAA Journal',
    year: 2024,
    doi: '10.2514/1.J063441',
    relevanceScore: 8.8,
    citationCount: 18,
    abstract: '…',
    tags: ['CFD', 'RDE'],
  },
  {
    id: 'p3',
    title: 'Hypersonic Transition',
    authors: 'Smith, J.',
    journal: 'Aerospace Science and Technology',
    year: 2022,
    doi: '10.1016/j.ast.2022.107580',
    relevanceScore: 7.2,
    citationCount: 9,
    abstract: '…',
    tags: ['hypersonics'],
  },
];

const empty = { search: '', tags: [], minScore: 0 };

describe('filterPapers', () => {
  it('returns every paper when no filter is applied', () => {
    expect(filterPapers(papers, empty)).toHaveLength(3);
  });

  it('searches title, authors and tags case-insensitively', () => {
    expect(filterPapers(papers, { ...empty, search: 'rde' }).map((paper) => paper.id)).toEqual([
      'p1',
      'p2',
    ]);
    expect(filterPapers(papers, { ...empty, search: 'smith' }).map((paper) => paper.id)).toEqual([
      'p3',
    ]);
    expect(
      filterPapers(papers, { ...empty, search: 'hypersonics' }).map((paper) => paper.id),
    ).toEqual(['p3']);
  });

  it('applies tags with OR semantics', () => {
    expect(
      filterPapers(papers, { ...empty, tags: ['CFD', 'hypersonics'] }).map((paper) => paper.id),
    ).toEqual(['p2', 'p3']);
  });

  it('filters by minimum relevance score', () => {
    expect(filterPapers(papers, { ...empty, minScore: 8.8 }).map((paper) => paper.id)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('combines search, tags and score', () => {
    expect(
      filterPapers(papers, { search: 'rde', tags: ['CFD'], minScore: 9 }).map((paper) => paper.id),
    ).toEqual([]);
  });
});

describe('allTags', () => {
  it('returns unique sorted tags', () => {
    expect(allTags(papers)).toEqual(['CFD', 'combustion', 'hypersonics', 'RDE']);
  });
});
