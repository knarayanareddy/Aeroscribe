// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PIPELINE_STAGES, createRun, type PipelineRun } from '@aeroscribe/pipeline';
import { CfdService } from '../src/cfd';
import { UnverifiableClaimError } from '../src/errors';
import { LiteratureService, type ReferenceRecord } from '../src/literature';
import { peerReview } from '../src/agents/review';
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
    expect(payload.references[0]!.citation).toBe(
      '[1] A. Author, B. Author (2024). Transonic drag prediction on unstructured meshes. AIAA Journal. doi:10.2514/1.j060001',
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

  it('rejects a note that carries a number the evidence does not contain', async () => {
    // Any prose copied into the manuscript is checked like any other claim, so a
    // solver note quoting "4000 iterations" with no matching evidence blocks it.
    await runUpToEvidence({ cfdNotes: ['The solver ran 4000 iterations to 1e-9 residual.'] });

    const error = await paperSynthesis(context(5)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnverifiableClaimError);
    expect((error as UnverifiableClaimError).details).toMatchObject({
      claims: expect.arrayContaining([expect.stringMatching(/4000/)]),
    });
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
});

describe('stage handlers agree with the pipeline definition', () => {
  it('uses the gate ids the shared pipeline defines', async () => {
    expect(PIPELINE_STAGES[4]!.gateId).toBe('GATE-4A');
    expect(run.stages[4]!.gateId).toBe(PIPELINE_STAGES[4]!.gateId);
  });
});
