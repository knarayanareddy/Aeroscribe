// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PIPELINE_STAGES, createRun, type PipelineRun } from '@aeroscribe/pipeline';
import { createFilesystemBlobStore } from '../src/blob';
import { CfdService } from '../src/cfd';
import { UnverifiableClaimError } from '../src/errors';
import { LiteratureService, type ReferenceRecord } from '../src/literature';
import type { ManuscriptPayload } from '@aeroscribe/contract';
import { complianceCheck, peerReview } from '../src/agents/review';
import { evidenceGeneration } from '../src/agents/evidence';
import {
  contributionFraming,
  literatureArchaeology,
  noveltyDetection,
  topicIntelligence,
} from '../src/agents/research';
import { paperSynthesis } from '../src/agents/writing';
import { DEFAULT_RUN_OPTIONS } from '../src/agents/types';
import type { StageContext } from '../src/agents/types';
import type { EvidenceRecord } from '../src/store';
import { FilesystemEvidenceStore } from '../src/store';

let directory: string;
let registry: FilesystemEvidenceStore;
let run: PipelineRun;
let literature: LiteratureService;
let cfd: CfdService;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-agents-'));
  registry = new FilesystemEvidenceStore(join(directory, 'registry.ndjson'));
  run = createRun({
    id: 'run-1',
    topic: 'transonic wing drag prediction for a Mach 0.78 transport',
    journal: 'AIAA Journal',
    now: new Date('2026-10-30T09:00:00.000Z'),
  });
  literature = new LiteratureService({ offline: true, providers: [] });
  cfd = new CfdService({
    su2: { available: false, binary: null },
    workDir: join(directory, 'cfd'),
  });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function context(stageId = 0, options: Partial<typeof DEFAULT_RUN_OPTIONS> = {}): StageContext {
  return {
    run,
    stage: run.stages[stageId]!,
    literature,
    cfd,
    registry,
    blobs: createFilesystemBlobStore({ dataDir: directory }),
    now: () => new Date('2026-10-30T10:00:00.000Z'),
    options: { ...DEFAULT_RUN_OPTIONS, paperLimit: 3, verifyTop: 0, ...options },
  };
}

async function appendFake(kind: EvidenceRecord['kind'], payload: unknown, stageId = 0) {
  return registry.append({ kind, runId: run.id, stageId, label: kind, payload });
}

/** Run stages 0–4 in order so stage 5 has something to write from. */
async function runUpToEvidence(overrides: { cfdNotes?: string[] } = {}) {
  await topicIntelligence(context(0));
  await appendFake('stage-output', { stage: 'topic-intelligence', topicNumbers: [0.78] }, 0);

  await literatureArchaeology(context(1));
  const literatureRecord = await registry.latest(run.id, 'literature-search');
  await appendFake('literature-search', literatureRecord?.payload ?? {}, 1);

  await noveltyDetection(context(2));
  const novelty = await registry.latest(run.id, 'novelty-report');
  await appendFake('novelty-report', novelty?.payload ?? {}, 2);

  await contributionFraming(context(3));
  const framing = await registry.latest(run.id, 'stage-output');
  await appendFake('stage-output', framing?.payload ?? {}, 3);

  const evidence = await evidenceGeneration(context(4));
  const payload = overrides.cfdNotes
    ? { ...(evidence.payload as object), notes: overrides.cfdNotes }
    : evidence.payload;
  await appendFake('cfd-run', payload, 4);
}

describe('topic intelligence', () => {
  it('records the journal, the keyword fit and the numbers in the topic', async () => {
    const outcome = await topicIntelligence(context(0));
    const payload = outcome.payload as {
      targetJournal: string;
      keywordFit: number;
      matchedKeywords: string[];
      topicNumbers: number[];
    };

    expect(payload.targetJournal).toBe('AIAA Journal');
    // The topic never mentions one of AIAA Journal's scope words, so the honest
    // fit here is zero rather than a made-up relevance score.
    expect(payload.keywordFit).toBe(0);
    expect(payload.matchedKeywords).toEqual([]);
    // "Mach 0.78" is part of the research question, so it is declared, not claimed.
    expect(payload.topicNumbers).toContain(0.78);
    expect(outcome.metrics.keywordFit).toMatch(/%$/);
  });

  it('scores a keyword fit when the topic is in the journal scope', async () => {
    const scoped = createRun({
      id: 'run-scoped',
      topic: 'aerodynamics of hypersonic re-entry vehicles',
      journal: 'AIAA Journal',
      now: new Date('2026-10-30T09:00:00.000Z'),
    });
    const outcome = await topicIntelligence({ ...context(0), run: scoped });
    const payload = outcome.payload as { keywordFit: number; matchedKeywords: string[] };

    expect(payload.keywordFit).toBeGreaterThan(0);
    expect(payload.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same topic', async () => {
    const first = await topicIntelligence(context(0));
    const second = await topicIntelligence(context(0));
    expect((second.payload as { keywordFit: number }).keywordFit).toBe(
      (first.payload as { keywordFit: number }).keywordFit,
    );
  });

  it('honours an explicitly requested journal', async () => {
    const explicit = createRun({
      id: 'run-2',
      topic: 'laminar-turbulent transition modelling',
      journal: 'Journal of Propulsion and Power',
      now: new Date('2026-10-30T09:00:00.000Z'),
    });
    const outcome = await topicIntelligence({ ...context(0), run: explicit });
    expect((outcome.payload as { journalId: string }).journalId).toBe('jpp');
  });
});

describe('literature archaeology', () => {
  it('never cites the offline corpus and says why each hit was rejected', async () => {
    const outcome = await literatureArchaeology(context(1, { verifyTop: 5 }));
    const payload = outcome.payload as {
      offline: boolean;
      references: unknown[];
      rejected: Array<{ reason: string }>;
      papersFound: number;
    };

    expect(payload.offline).toBe(true);
    expect(payload.references).toEqual([]);
    expect(payload.papersFound).toBeGreaterThan(0);
    expect(payload.rejected.length).toBe(payload.papersFound);
    expect(payload.rejected[0]!.reason).toMatch(/offline corpus entries have no DOI/i);
    expect(outcome.metrics.papersVerified).toBe(0);
  });
});

describe('literature archaeology — structured references', () => {
  /** A provider that returns one resolvable record per DOI, with full metadata. */
  const provider = {
    name: 'crossref' as const,
    requiresNetwork: true,
    async search(query: string) {
      return [
        {
          id: 'crossref:10.2514/1.j060001',
          source: 'crossref' as const,
          title: 'Transonic drag prediction on unstructured meshes',
          authors: ['A. Author', 'B. Author'],
          year: 2024,
          doi: '10.2514/1.j060001',
          url: null,
          abstract: 'transonic wing drag',
          citationCount: 3,
          containerTitle: 'AIAA Journal',
          volume: '62',
          pages: '1201-1215',
          publisher: 'AIAA',
          query,
        },
      ];
    },
    async resolveDoi(doi: string) {
      const [found] = await provider.search('');
      return found ? { ...found, doi } : null;
    },
  };

  it('records a verified reference as structured fields, not just a citation string', async () => {
    const live = new LiteratureService({ offline: false, providers: [provider] });
    const outcome = await literatureArchaeology({
      ...context(1, { paperLimit: 1, verifyTop: 1 }),
      literature: live,
    });

    const payload = outcome.payload as {
      schemaVersion: number;
      references: ReferenceRecord[];
      papers: Array<{ title: string }>;
    };

    expect(payload.schemaVersion).toBe(2);
    expect(payload.references).toHaveLength(1);
    expect(payload.references[0]).toMatchObject({
      key: 'ref-01',
      index: 1,
      title: 'Transonic drag prediction on unstructured meshes',
      doi: '10.2514/1.j060001',
      venue: 'AIAA Journal',
      volume: '62',
      pages: '1201-1215',
      publisher: 'AIAA',
      verified: { provider: 'crossref', titleSimilarity: 1 },
    });
    // Verification carries its own timestamp — the moment the DOI resolved,
    // taken from the literature service's clock, not the stage's.
    expect(payload.references[0]!.verified.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    // The provider record is still available for display (abstracts, counts).
    expect(payload.papers[0]!.title).toMatch(/Transonic drag/);
  });

  it('renders the citation from those fields and nothing else', async () => {
    const live = new LiteratureService({ offline: false, providers: [provider] });
    // Stage 0 declares the numbers that belong to the research question itself.
    const topic = await topicIntelligence(context(0));
    await appendFake('stage-output', topic.payload, 0);

    const found = await literatureArchaeology({
      ...context(1, { paperLimit: 1, verifyTop: 1 }),
      literature: live,
    });
    await appendFake('literature-search', found.payload, 1);
    await appendFake('novelty-report', { gapCount: 0, verifiedReferences: 1 }, 2);
    const framing = await contributionFraming(context(3));
    await appendFake('stage-output', framing.payload, 3);
    const evidence = await evidenceGeneration(context(4));
    await appendFake('cfd-run', evidence.payload, 4);

    const manuscript = await paperSynthesis(context(5));
    const payload = manuscript.payload as {
      schemaVersion: number;
      references: Array<{ citation: string; doi: string; record: ReferenceRecord }>;
    };

    expect(payload.schemaVersion).toBe(2);
    // RULE-032: the AIAA journal form, set from the record's fields only.
    expect(payload.references[0]!.citation).toBe(
      '[1] A. Author and B. Author, "Transonic drag prediction on unstructured meshes," AIAA Journal, Vol. 62, 2024, pp. 1201–1215. doi:10.2514/1.j060001',
    );
    // The line and the record cannot drift: the record is stored beside it.
    expect(payload.references[0]!.record.venue).toBe('AIAA Journal');
  });
});

describe('novelty and framing', () => {
  it('reports insufficient evidence rather than inventing a novelty score', async () => {
    await appendFake('literature-search', { references: [], offline: true }, 1);

    const outcome = await noveltyDetection(context(2));
    const payload = outcome.payload as { confidence: string; notes: string[]; gapCount: number };

    expect(payload.confidence).toBe('insufficient-evidence');
    expect(payload.notes.join(' ')).toMatch(/at least 3/);
    expect(payload.notes.join(' ')).toMatch(/fictional corpus/i);
    expect(payload.gapCount).toBeGreaterThan(0);
  });

  it('treats a term nobody published on as a candidate gap', async () => {
    await appendFake(
      'literature-search',
      {
        references: [
          {
            title: 'Drag prediction',
            abstract: 'transonic wing drag',
            doi: '10.2514/1.A1',
            authors: ['A'],
            year: 2020,
          },
          {
            title: 'Transport aircraft',
            abstract: 'transport',
            doi: '10.2514/1.A2',
            authors: ['B'],
            year: 2021,
          },
          {
            title: 'Wing optimisation',
            abstract: 'wing',
            doi: '10.2514/1.A3',
            authors: ['C'],
            year: 2022,
          },
        ],
        offline: false,
      },
      1,
    );

    const outcome = await noveltyDetection(context(2));
    const payload = outcome.payload as {
      confidence: string;
      uncoveredTerms: string[];
      verifiedReferences: number;
    };

    expect(payload.confidence).toBe('supported');
    expect(payload.verifiedReferences).toBe(3);
    expect(payload.uncoveredTerms).not.toContain('wing');
  });

  it('builds the contribution statement only from the recorded reports', async () => {
    await appendFake(
      'stage-output',
      { stage: 'topic-intelligence', journalId: 'aiaa-journal', targetJournal: 'AIAA Journal' },
      0,
    );
    await appendFake(
      'novelty-report',
      {
        verifiedReferences: 4,
        uncoveredTerms: ['transonic', 'prediction'],
        gapCount: 2,
        confidence: 'supported',
      },
      2,
    );

    const outcome = await contributionFraming(context(3));
    const payload = outcome.payload as {
      statement: string;
      evidenceBasis: { verifiedReferences: number; gaps: number };
      position: string;
      journal: string;
    };

    expect(payload.position).toBe('gap-filling');
    expect(payload.journal).toBe('AIAA Journal');
    expect(payload.evidenceBasis).toEqual({ verifiedReferences: 4, gaps: 2 });
    expect(payload.statement).toContain('transonic');
    expect(payload.statement).toContain('4 DOI-verified references');
  });
});

describe('paper synthesis', () => {
  it('writes a manuscript whose every number traces to evidence', async () => {
    await runUpToEvidence();

    const outcome = await paperSynthesis(context(5));
    const payload = outcome.payload as {
      sections: Array<{ heading: string }>;
      referenceCount: number;
      synthetic: boolean;
      numbers: Record<string, number>;
    };

    expect(payload.sections.map((section) => section.heading)).toContain('AI use disclosure');
    expect(payload.referenceCount).toBe(0);
    expect(payload.synthetic).toBe(true);
    expect(payload.numbers.value).toBeGreaterThan(0);
    expect(outcome.summary).toMatch(/traced to evidence/);
    expect(outcome.kind).toBe('manuscript');
  });

  it('refuses to write when the CFD record is missing', async () => {
    await expect(paperSynthesis(context(5))).rejects.toBeInstanceOf(UnverifiableClaimError);
  });

  it('does not quote a solver note that carries numbers of its own', async () => {
    // A note is quoted only when it has no numeral: every number in a planned
    // paragraph must be a declared key, and free text cannot be declared. The
    // note stays in the cfd-run record; it is simply not prose.
    await runUpToEvidence({ cfdNotes: ['The solver ran 4000 iterations to 1e-9 residual.'] });

    const outcome = await paperSynthesis(context(5));
    const payload = outcome.payload as {
      sections: Array<{ heading: string; body: string; paragraphs: Array<{ id: string }> }>;
    };
    const text = payload.sections.map((section) => section.body).join('\n');

    expect(text).not.toContain('4000');
    expect(
      payload.sections.find((section) => section.heading === 'Method')!.paragraphs,
    ).toHaveLength(1);
  });

  it('writes the plan before the manuscript and binds the text to it', async () => {
    await runUpToEvidence();

    const outcome = await paperSynthesis(context(5));
    const payload = outcome.payload as {
      planRef: { seq: number; hash: string };
      sections: Array<{ heading: string; paragraphs: Array<{ id: string; text: string }> }>;
    };

    const records = await registry.list({ runId: run.id });
    const planRecord = records.find((record) => record.kind === 'manuscript-plan');
    expect(planRecord).toBeDefined();
    // The plan is in the registry *before* the manuscript that points at it: the
    // orchestrator appends the manuscript after the handler returns, so inside
    // the handler the plan is the newest record of the run.
    expect(records[records.length - 1]!.kind).toBe('manuscript-plan');

    expect(payload.planRef.seq).toBe(planRecord!.seq);
    expect(payload.planRef.hash).toBe(planRecord!.payloadHash);

    const plan = planRecord!.payload as {
      stage: string;
      schemaVersion: number;
      sections: Array<{ heading: string; purpose: string; paragraphs: Array<{ id: string }> }>;
    };
    expect(plan.stage).toBe('plan');
    expect(plan.schemaVersion).toBe(1);
    // Every planned paragraph has text, and every paragraph has an id the plan
    // issued — that is what "the text is a projection of the plan" means.
    const plannedIds = plan.sections.flatMap((section) =>
      section.paragraphs.map((paragraph) => paragraph.id),
    );
    const writtenIds = payload.sections.flatMap((section) =>
      section.paragraphs.map((paragraph) => paragraph.id),
    );
    expect(writtenIds).toEqual(plannedIds);
    expect(new Set(plannedIds).size).toBe(plannedIds.length);
    for (const section of payload.sections) {
      for (const paragraph of section.paragraphs) expect(paragraph.text.length).toBeGreaterThan(0);
    }
  });

  it('orders the plan by the journal section order, then the disclosure', async () => {
    await runUpToEvidence();
    const outcome = await paperSynthesis(context(5));
    const payload = outcome.payload as { sections: Array<{ heading: string }> };

    expect(payload.sections.map((section) => section.heading)).toEqual([
      'Introduction',
      'Method',
      'Results',
      'Discussion',
      'Conclusion',
      'AI use disclosure',
    ]);
  });

  it('sets every reference in an AIAA form and records what the form omitted', async () => {
    const paper = {
      id: 'crossref:10.2514/1.j060001',
      source: 'crossref' as const,
      title: 'Transonic drag prediction on unstructured meshes',
      authors: ['A. Author', 'B. Author'],
      year: 2024,
      doi: '10.2514/1.j060001',
      url: null,
      abstract: 'transonic wing drag',
      citationCount: 3,
      containerTitle: 'AIAA Journal',
      volume: '62',
    };
    const stub = {
      name: 'crossref' as const,
      requiresNetwork: true,
      async search() {
        return [paper];
      },
      async resolveDoi(doi: string) {
        return { ...paper, doi };
      },
    };
    const live = new LiteratureService({ offline: false, providers: [stub] });
    const topic = await topicIntelligence(context(0));
    await appendFake('stage-output', topic.payload, 0);
    const found = await literatureArchaeology({
      ...context(1, { paperLimit: 1, verifyTop: 1 }),
      literature: live,
    });
    await appendFake('literature-search', found.payload, 1);
    await appendFake('novelty-report', { gapCount: 0, verifiedReferences: 1 }, 2);
    const framing = await contributionFraming(context(3));
    await appendFake('stage-output', framing.payload, 3);
    const evidence = await evidenceGeneration(context(4));
    await appendFake('cfd-run', evidence.payload, 4);

    const manuscript = await paperSynthesis(context(5));
    const payload = manuscript.payload as {
      citations: Array<{ key: string; style: string; missing: string[] }>;
    };

    expect(payload.citations).toHaveLength(1);
    expect(payload.citations[0]!.style).toBe('aiaa-journal');
    // No issue number and no page range were recorded by the stub provider, so
    // the form omits them and lists them instead of inventing a range.
    expect(payload.citations[0]!.missing).toEqual(expect.arrayContaining(['issue', 'pages']));
  });
});

describe('peer review', () => {
  it('asks for revision when the evidence is synthetic and uncited', async () => {
    await runUpToEvidence();
    const manuscript = await paperSynthesis(context(5));
    await appendFake('manuscript', manuscript.payload, 5);

    const outcome = await peerReview(context(6));
    const payload = outcome.payload as {
      verdict: string;
      checks: Array<{ id: string; passed: boolean }>;
      comments: Array<{ severity: string; comment: string }>;
    };

    expect(payload.verdict).toBe('revise');
    expect(payload.checks.find((check) => check.id === 'RULE-004')).toMatchObject({ passed: true });
    expect(payload.checks.find((check) => check.id === 'RULE-001')).toMatchObject({ passed: true });
    expect(payload.checks.find((check) => check.id === 'REFERENCES')).toMatchObject({
      passed: false,
    });
    expect(payload.comments.map((comment) => comment.comment).join(' ')).toMatch(
      /synthetic solver/,
    );
    expect(outcome.metrics.verdict).toBe('revise');
  });

  it('cannot run without a manuscript record', async () => {
    await expect(peerReview(context(6))).rejects.toThrow(/requires a manuscript/i);
  });

  /**
   * The projection checks, one per failure mode the plan can catch.
   *
   * Each test writes the manuscript stage 5 produced, tampers with one thing,
   * and asserts that stage 6 names it. The tampering is the point: text and plan
   * can only disagree if somebody edits one of them.
   */
  async function reviewAfter(tamper: (payload: ManuscriptPayload) => ManuscriptPayload): Promise<{
    verdict: string;
    comments: Array<{ severity: string; comment: string; section: string }>;
    checks: Array<{ id: string; passed: boolean }>;
  }> {
    await runUpToEvidence();
    const manuscript = await paperSynthesis(context(5));
    await appendFake('manuscript', tamper(manuscript.payload as ManuscriptPayload), 5);
    const outcome = await peerReview(context(6));
    return outcome.payload as {
      verdict: string;
      comments: Array<{ severity: string; comment: string; section: string }>;
      checks: Array<{ id: string; passed: boolean }>;
    };
  }

  it('passes RULE-030 for the text stage 5 actually wrote', async () => {
    const payload = await reviewAfter((manuscript) => manuscript);

    expect(payload.checks.find((check) => check.id === 'RULE-030')).toMatchObject({
      passed: true,
    });
    expect(payload.comments.filter((comment) => /paragraph p-/.test(comment.comment))).toEqual([]);
  });

  it('asks for revision when a planned paragraph is missing from the text', async () => {
    const payload = await reviewAfter((manuscript) => ({
      ...manuscript,
      sections: manuscript.sections.map((section) =>
        section.heading === 'Results'
          ? { ...section, paragraphs: section.paragraphs!.slice(0, 1) }
          : section,
      ),
    }));

    const comment = payload.comments.find((entry) =>
      /The plan's paragraph p-results-2/.test(entry.comment),
    );
    expect(comment).toMatchObject({ severity: 'major' });
    expect(payload.verdict).toBe('revise');
    expect(payload.checks.find((check) => check.id === 'RULE-030')).toMatchObject({
      passed: false,
    });
  });

  it('asks for revision when a paragraph prints a number its plan never declared', async () => {
    const payload = await reviewAfter((manuscript) => ({
      ...manuscript,
      sections: manuscript.sections.map((section) =>
        section.heading === 'Conclusion'
          ? {
              ...section,
              paragraphs: section.paragraphs!.map((paragraph) =>
                paragraph.id === 'p-conclusion-2'
                  ? { ...paragraph, text: `${paragraph.text} The solver needed 41 iterations.` }
                  : paragraph,
              ),
            }
          : section,
      ),
    }));

    expect(
      payload.comments.find((entry) => /Paragraph p-conclusion-2 prints 41/.test(entry.comment)),
    ).toMatchObject({ severity: 'major' });
    expect(payload.verdict).toBe('revise');
  });

  it('records an overlong paragraph as a minor finding, not a blocking one', async () => {
    const padding = Array.from({ length: 60 }, () => 'word').join(' ');
    const payload = await reviewAfter((manuscript) => ({
      ...manuscript,
      sections: manuscript.sections.map((section) =>
        section.heading === 'Conclusion'
          ? {
              ...section,
              paragraphs: section.paragraphs!.map((paragraph) =>
                paragraph.id === 'p-conclusion-2'
                  ? { ...paragraph, text: `${paragraph.text} ${padding}` }
                  : paragraph,
              ),
            }
          : section,
      ),
    }));

    const comment = payload.comments.find((entry) =>
      /Paragraph p-conclusion-2 is \d+ words/.test(entry.comment),
    );
    expect(comment).toMatchObject({ severity: 'minor' });
  });

  it('asks for revision when planRef does not resolve to the plan record', async () => {
    const payload = await reviewAfter((manuscript) => ({
      ...manuscript,
      planRef: { seq: manuscript.planRef!.seq, hash: '0'.repeat(64) },
    }));

    expect(
      payload.comments.find((entry) => /planRef hashes evidence/.test(entry.comment)),
    ).toMatchObject({ severity: 'major' });
    expect(payload.verdict).toBe('revise');
  });

  it('cannot verify a projection it was never given', async () => {
    const payload = await reviewAfter((manuscript) => ({
      ...manuscript,
      // A manuscript that predates the plan: text, no ids, no planRef.
      planRef: undefined,
      sections: manuscript.sections.map((section) => ({
        heading: section.heading,
        body: section.body,
      })),
    }));

    const check = payload.checks.find((entry) => entry.id === 'RULE-030');
    expect(check).toMatchObject({ passed: false, skipped: true });
  });
});

describe('compliance — AIAA citation format (RULE-032)', () => {
  const reference = (overrides: Partial<ReferenceRecord> = {}): ReferenceRecord => ({
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
    url: null,
    verified: { verifiedAt: null, provider: 'crossref', titleSimilarity: 1 },
    ...overrides,
  });

  /** A manuscript that satisfies every other stage-7 check, so only the
   *  citation-format rule can differ between these tests. */
  async function complianceWith(citations: ManuscriptPayload['citations']) {
    const record = reference();
    const payload: ManuscriptPayload = {
      stage: 'paper-synthesis',
      schemaVersion: 2,
      title: 'Transonic drag prediction',
      journal: 'AIAA Journal',
      journalId: 'aiaa-journal',
      abstract: 'A short abstract.',
      sections: ['Introduction', 'Method', 'Results', 'Discussion', 'Conclusion'].map(
        (heading) => ({ heading, body: `${heading} text.` }),
      ),
      wordCount: 20,
      referenceCount: 1,
      references: [
        {
          index: 1,
          citation:
            '[1] A. Author and B. Author, "Transonic drag prediction on unstructured meshes," AIAA Journal, Vol. 62, No. 3, 2024, pp. 1201\u20131215. doi:10.2514/1.J060001',
          doi: '10.2514/1.J060001',
          record,
        },
      ],
      numbers: {},
      citations,
      generatedAt: '2026-11-01T10:00:00.000Z',
      synthetic: false,
    };
    await appendFake('manuscript', payload, 5);
    const outcome = await complianceCheck(context(7));
    return outcome.payload as {
      compliant: boolean;
      issues: Array<{ rule: string; severity: string; detail: string }>;
    };
  }

  it('reports a minor note when the form omitted only optional fields', async () => {
    const payload = await complianceWith([
      { key: 'ref-01', style: 'aiaa-journal', missing: ['issue', 'pages'] },
    ]);
    const issue = payload.issues.find((entry) => entry.rule === 'citation-format')!;

    expect(issue.severity).toBe('minor');
    expect(issue.detail).toMatch(/set in AIAA form without issue, pages/);
    expect(payload.compliant).toBe(true);
  });

  it('blocks a submission whose reference cannot be set in any AIAA form', async () => {
    const payload = await complianceWith([
      { key: 'ref-01', style: 'incomplete', missing: ['authors', 'title', 'year', 'venue'] },
    ]);
    const issue = payload.issues.find((entry) => entry.rule === 'citation-format')!;

    expect(issue.severity).toBe('major');
    expect(issue.detail).toMatch(/cannot be set in an AIAA form/);
    expect(payload.compliant).toBe(false);
  });

  it('says nothing when the manuscript carries no citation records', async () => {
    const payload = await complianceWith(undefined);
    expect(payload.issues.some((entry) => entry.rule === 'citation-format')).toBe(false);
  });
});

describe('stage handlers agree with the pipeline definition', () => {
  it('uses the gate ids the shared pipeline defines', async () => {
    expect(PIPELINE_STAGES[4]!.gateId).toBe('GATE-4A');
    expect(run.stages[4]!.gateId).toBe(PIPELINE_STAGES[4]!.gateId);
  });
});
