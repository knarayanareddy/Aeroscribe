import type { DoiRecheckPayload, EvidenceRecord, LiteraturePayload } from '@aeroscribe/contract';
import { describe, expect, it } from 'vitest';
import evidenceFixture from './__fixtures__/evidence.json';
import {
  formatReferenceLine,
  isCfdPayload,
  isLiteraturePayload,
  isRecheckPayload,
  isRenderPayload,
  latestPayload,
  latestRecord,
  toLiveCfd,
  toLiveGaps,
  toLiveManuscript,
  toLiveRecheck,
  toLiveReferences,
  toLiveRender,
  toLiveReview,
} from './mappers';

/**
 * These tests read a capture the API really produced (see
 * `services/api/test/contract.test.ts`), so a mapper that only works on
 * hand-written data fails here.
 */
const records = (evidenceFixture as { records: EvidenceRecord[] }).records;

describe('record lookup', () => {
  it('returns the newest record of a kind', () => {
    const record = latestRecord(records, 'manuscript');
    expect(record?.kind).toBe('manuscript');
    expect(record).toBe(records.filter((entry) => entry.kind === 'manuscript').at(-1));
  });

  it('returns null when the run has no such record', () => {
    expect(latestRecord(records, 'cfd-run')).not.toBeNull();
    expect(latestRecord([], 'cfd-run')).toBeNull();
  });

  it('refuses a payload that does not match the guard', () => {
    const cfd = records.find((record) => record.kind === 'cfd-run')!;
    expect(latestPayload([cfd], 'cfd-run', isLiteraturePayload)).toBeNull();
    expect(latestPayload([cfd], 'cfd-run', isCfdPayload)).not.toBeNull();
  });
});

describe('literature mapping', () => {
  const payload = latestPayload(records, 'literature-search', isLiteraturePayload)!;

  it('maps every admitted reference, joining the provider record by DOI', () => {
    const references = toLiveReferences(payload);
    expect(references).toHaveLength(payload.references.length);
    for (const reference of references) {
      expect(reference.key).toMatch(/^ref-\d{2}$/);
      expect(reference.verifiedAt).toMatch(/T/);
    }
  });

  it('carries no relevance score, because the API records none', () => {
    const [first] = toLiveReferences(payload);
    expect(first).toBeDefined();
    expect(first).not.toHaveProperty('relevanceScore');
    expect(first).not.toHaveProperty('tags');
  });

  it('renders a citation from fields only, with an explicit missing title', () => {
    const [reference] = toLiveReferences(payload);
    const line = formatReferenceLine({
      ...reference!,
      title: null,
      authors: [],
      year: null,
      venue: null,
      doi: null,
    });
    expect(line).toContain('Unknown authors');
    expect(line).toContain('n.d.');
    expect(line).toContain('title not recorded');
    expect(line).not.toContain('doi:');
  });

  it('does not shorten a three-author list', () => {
    const line = formatReferenceLine({
      key: 'ref-01',
      title: 'T',
      authors: ['A', 'B', 'C'],
      year: 2024,
      venue: null,
      doi: '10.1/x',
      url: null,
      volume: null,
      pages: null,
      publisher: null,
      rank: null,
      citationCount: null,
      abstract: null,
      verifiedAt: null,
      verifiedBy: null,
    });
    expect(line).toContain('A, B, C');
    expect(line).not.toContain('et al');
  });

  it('uses the recorded venue and DOI when present', () => {
    const references = toLiveReferences(payload);
    const withTitle = references.find((reference) => reference.title !== null);
    if (withTitle) {
      expect(formatReferenceLine(withTitle)).toContain(withTitle.title!);
    }
  });
});

describe('CFD mapping', () => {
  const payload = latestPayload(records, 'cfd-run', isCfdPayload)!;

  it('keeps the solver label, the disclaimer and the artefact hashes', () => {
    const cfd = toLiveCfd(payload);
    expect(['su2', 'synthetic']).toContain(cfd.solver);
    if (cfd.solver === 'synthetic') expect(cfd.disclaimer).toBeTruthy();
    expect(cfd.artefacts.length).toBeGreaterThan(0);
    expect(cfd.artefacts[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not invent a GCI study when the payload has none', () => {
    const cfd = toLiveCfd({ ...payload, gci: null });
    expect(cfd.gci).toBeNull();
  });

  it('carries the mesh table through unchanged', () => {
    const cfd = toLiveCfd(payload);
    expect(cfd.gci?.levels.map((level) => level.cells)).toEqual(
      payload.gci?.levels.map((level) => level.cells),
    );
  });
});

describe('novelty, manuscript and review', () => {
  it('reports gaps as terms with no score, rather than inventing one', () => {
    const novelty = latestRecord(records, 'novelty-report');
    expect(novelty).not.toBeNull();

    const payload = novelty!.payload as { uncoveredTerms: string[]; coveredTerms: string[] };
    const gaps = toLiveGaps({
      stage: 'novelty-detection',
      schemaVersion: 1,
      verifiedReferences: 2,
      uncoveredTerms: payload.uncoveredTerms,
      coveredTerms: payload.coveredTerms,
      gapCount: payload.uncoveredTerms.length,
      confidence: 'supported',
      notes: [],
    });

    // The API records coverage, not a novelty score or a competitor risk: the
    // mapper must not fabricate either.
    expect(gaps.map((gap) => gap.term)).toEqual(payload.uncoveredTerms);
    for (const gap of gaps) {
      expect(gap.noveltyScore).toBeNull();
      expect(gap.competitorRisk).toBeNull();
    }
  });

  it('counts words from the rendered section text', () => {
    const manuscriptRecord = records.find((record) => record.kind === 'manuscript');
    expect(manuscriptRecord).toBeDefined();
    const manuscript = toLiveManuscript(manuscriptRecord!.payload as never);
    for (const section of manuscript.sections) {
      expect(section.words).toBe(section.body.trim().split(/\s+/).filter(Boolean).length);
    }
    expect(manuscript.references.length).toBe(manuscript.references.length);
  });

  it('counts passed review checks from the checks themselves', () => {
    const record = records.find((entry) => entry.kind === 'review-report')!;
    const review = toLiveReview(record.payload as never);
    expect(review.passedChecks).toBe(review.checks.filter((check) => check.passed).length);
  });
});

describe('rendered manuscript mapping', () => {
  // The payload is the one the contract test recorded from a real stage-8 run.
  const payload = latestPayload(records, 'manuscript-render', isRenderPayload)!;

  it('reads the recorded render, including the files it wrote', () => {
    expect(isRenderPayload(payload)).toBe(true);
    expect(isRenderPayload({ stage: 'aerowiki-submission' })).toBe(false);

    const live = toLiveRender(payload);
    expect(live.template).toBe('aiaa-style');
    expect(live.typeset).toBe('source-only');
    expect(live.files.map((file) => file.name)).toEqual([
      'manuscript.tex',
      'references.bib',
      'figure-1.tex',
      'figure-1.dat',
    ]);
    expect(live.pdf).toBeNull();
    expect(live.summary).toMatch(/LaTeX source only/);
    expect(live.summary).toMatch(/no PDF exists/);
  });

  it('says which engine typeset the PDF when there is one', () => {
    const live = toLiveRender({
      ...payload,
      typeset: 'pdf',
      pdf: { sha256: 'a'.repeat(64), bytes: 1000 },
      toolchain: { binary: '/usr/bin/pdflatex', version: 'pdfTeX 3.141592653' },
    });
    expect(live.summary).toMatch(/Typeset to PDF with pdfTeX 3\.141592653/);
    expect(live.pdf?.bytes).toBe(1000);
  });
});

describe('reference re-check mapping', () => {
  const payload: DoiRecheckPayload = {
    stage: 'reference-recheck',
    schemaVersion: 1,
    runId: 'run-1',
    checkedAt: '2026-10-31T08:00:00.000Z',
    offline: false,
    maxAgeDays: 30,
    summary: { fresh: 1, stale: 2, broken: 0, mismatch: 0, unverified: 0, total: 3 },
    results: [
      {
        key: 'ref-01',
        doi: '10.2514/1.j060001',
        title: 'Transonic drag prediction',
        status: 'fresh',
        reason: 'DOI resolves and the title matches',
        provider: 'crossref',
        titleSimilarity: 0.97,
        previousVerifiedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  };

  it('keeps the payload and states what it supports', () => {
    expect(isRecheckPayload(payload)).toBe(true);
    expect(isRecheckPayload({ stage: 'paper-synthesis' })).toBe(false);

    const live = toLiveRecheck(payload);
    expect(live.results).toBe(payload.results);
    expect(live.summary).toBe(payload.summary);
    expect(live.headline).toBe('3 references checked: 1 fresh, 2 stale, 0 unverified.');
  });

  it('never calls an offline check a verification', () => {
    const live = toLiveRecheck({
      ...payload,
      offline: true,
      summary: { fresh: 0, stale: 0, broken: 0, mismatch: 0, unverified: 3, total: 3 },
    });
    expect(live.headline).toMatch(/no DOI was resolved/);
    expect(live.headline).toMatch(/no reference is confirmed/);
    expect(live.headline).not.toMatch(/\bverified\b/);
  });

  it('counts broken and mismatched DOIs in one sentence', () => {
    const live = toLiveRecheck({
      ...payload,
      summary: { fresh: 0, stale: 1, broken: 1, mismatch: 1, unverified: 0, total: 3 },
    });
    expect(live.headline).toBe('2 of 3 DOIs no longer match their stored reference.');
  });
});

describe('guards', () => {
  it('rejects a payload of another stage', () => {
    const literature: LiteraturePayload = {
      stage: 'literature-archaeology',
      schemaVersion: 2,
      query: 'q',
      searchedAt: '2026-01-01T00:00:00.000Z',
      offline: true,
      papersFound: 0,
      papersVerified: 0,
      references: [],
      papers: [],
      rejected: [],
      providerErrors: [],
    };
    expect(isLiteraturePayload(literature)).toBe(true);
    expect(isCfdPayload(literature)).toBe(false);
    expect(isLiteraturePayload(null)).toBe(false);
    expect(isLiteraturePayload('literature-archaeology')).toBe(false);
  });
});
