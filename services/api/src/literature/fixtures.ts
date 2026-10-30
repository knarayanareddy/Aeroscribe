import type { Paper } from './types';

/**
 * The offline corpus.
 *
 * Every entry here is **fictional** and deliberately has no DOI. It exists so
 * the pipeline can be exercised without network access (CI, air-gapped demos),
 * and so the claim verifier has something it must *reject*: a paper without a
 * resolved DOI may never be cited in a manuscript (RULE-002). Titles are
 * prefixed with "Offline fixture" so a generated reference list can never be
 * mistaken for real literature.
 */
export const OFFLINE_CORPUS: readonly Paper[] = [
  {
    id: 'fixture:rde-cell-width',
    source: 'fixture',
    title: 'Offline fixture — Detonation cell width sensitivity to chamber pressure',
    authors: ['Fixture Author A', 'Fixture Author B'],
    year: 2024,
    doi: null,
    url: null,
    abstract:
      'Fictional abstract used by the offline corpus. It describes a parametric study that does not exist, so that the pipeline has text to summarise while every citation stays unverifiable.',
    citationCount: 0,
  },
  {
    id: 'fixture:rde-stratospheric',
    source: 'fixture',
    title: 'Offline fixture — Rotating detonation operation at stratospheric inlet conditions',
    authors: ['Fixture Author C'],
    year: 2023,
    doi: null,
    url: null,
    abstract:
      'Fictional abstract used by the offline corpus. No experimental campaign reported here has taken place.',
    citationCount: 0,
  },
  {
    id: 'fixture:hypersonic-transition',
    source: 'fixture',
    title: 'Offline fixture — Boundary-layer transition on blunt re-entry geometries',
    authors: ['Fixture Author D', 'Fixture Author E'],
    year: 2025,
    doi: null,
    url: null,
    abstract:
      'Fictional abstract used by the offline corpus. It contains no measurements and must not be cited.',
    citationCount: 0,
  },
  {
    id: 'fixture:morphing-wing',
    source: 'fixture',
    title: 'Offline fixture — SMA-actuated variable camber wings in transonic flow',
    authors: ['Fixture Author F'],
    year: 2022,
    doi: null,
    url: null,
    abstract:
      'Fictional abstract used by the offline corpus. Provided to exercise relevance ranking only.',
    citationCount: 0,
  },
  {
    id: 'fixture:grid-convergence',
    source: 'fixture',
    title: 'Offline fixture — Grid convergence practice for RANS-based drag prediction',
    authors: ['Fixture Author G'],
    year: 2021,
    doi: null,
    url: null,
    abstract:
      'Fictional abstract used by the offline corpus, describing a verification study that was never run.',
    citationCount: 0,
  },
];

/** True for any paper that came from the offline corpus. */
export function isFixturePaper(paper: Paper): boolean {
  return paper.source === 'fixture';
}

/** Crude keyword match; enough to make offline searches behave sensibly. */
export function searchOfflineCorpus(query: string, limit: number): Paper[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);

  const scored = OFFLINE_CORPUS.map((paper) => {
    const haystack = `${paper.title} ${paper.abstract ?? ''}`.toLowerCase();
    const score = terms.filter((term) => haystack.includes(term)).length;
    return { paper, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score > 0)
    .slice(0, limit)
    .map((entry) => entry.paper);
}
