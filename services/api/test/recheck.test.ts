// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DoiVerification, ManuscriptPayload, Paper } from '@aeroscribe/contract';
import { canonicalJson } from '../src/lib/canonical';
import { LiteratureService, type LiteratureProvider } from '../src/literature';
import {
  ageInDays,
  classifyVerification,
  overallStanding,
  recheckRun,
  referenceBlockers,
  referenceStatus,
  summarise,
} from '../src/references/recheck';
import { CfdService } from '../src/cfd';
import { Orchestrator } from '../src/orchestrator';
import { AuditLog } from '../src/store/audit';
import { EvidenceRegistry } from '../src/store/registry';
import { RunRepository } from '../src/store/runs';

/**
 * DOI re-checking.
 *
 * The unit tests pin the five statuses and the stage-8 rule; the integration
 * test drives the acceptance case from the plan: a provider that resolves a DOI
 * once and then stops, so the stored reference goes `broken` while the manuscript
 * payload stays byte-identical and the registry stays verifiable.
 */

let directory: string;
let registry: EvidenceRegistry;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-recheck-'));
  registry = new EvidenceRegistry(join(directory, 'registry.ndjson'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const NOW = new Date('2026-11-30T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: 'crossref:10.2514/1.j060001',
    source: 'crossref',
    title: 'Transonic drag prediction on unstructured meshes',
    authors: ['A. Author', 'B. Author'],
    year: 2024,
    doi: '10.2514/1.j060001',
    url: 'https://doi.org/10.2514/1.j060001',
    abstract: null,
    citationCount: 12,
    ...overrides,
  };
}

function verified(overrides: Partial<DoiVerification> = {}): DoiVerification {
  return {
    doi: '10.2514/1.j060001',
    normalised: '10.2514/1.j060001',
    verified: true,
    provider: 'crossref',
    paper: paper(),
    checkedAt: NOW.toISOString(),
    titleSimilarity: 1,
    ...overrides,
  };
}

/* ─────────────────────────── classification ─────────────────────────────── */

describe('classifyVerification', () => {
  const base = { offline: false, doi: '10.2514/1.j060001', now: NOW, maxAgeDays: 30 };

  it('is unverified when the reference carries no DOI', () => {
    const result = classifyVerification({
      ...base,
      doi: null,
      verification: null,
      previousVerifiedAt: daysAgo(1),
    });

    expect(result.status).toBe('unverified');
    expect(result.reason).toMatch(/RULE-002/);
    expect(result.provider).toBeNull();
  });

  it('is unverified offline, and never says the check passed', () => {
    const result = classifyVerification({
      ...base,
      offline: true,
      // Even a stored verification that once succeeded cannot be confirmed now.
      verification: verified({ verified: false, reason: 'offline mode: no registry reachable' }),
      previousVerifiedAt: daysAgo(2),
    });

    expect(result.status).toBe('unverified');
    // The word "verified" must not appear: the check did not happen. (Note that
    // "unverified" would pass this test on a substring match, so the boundary is
    // what is asserted.)
    expect(result.reason).not.toMatch(/\bverified\b/i);
    expect(result.reason).toMatch(/offline mode/i);
  });

  it('is unverified when no verification was attempted at all', () => {
    expect(
      classifyVerification({ ...base, verification: null, previousVerifiedAt: null }).status,
    ).toBe('unverified');
  });

  it('is fresh when it resolves and the stored check is recent', () => {
    const result = classifyVerification({
      ...base,
      verification: verified(),
      previousVerifiedAt: daysAgo(10),
    });

    expect(result.status).toBe('fresh');
    expect(result.reason).toBeNull();
    expect(result.provider).toBe('crossref');
    expect(result.titleSimilarity).toBe(1);
  });

  it('is fresh when it resolves and the manuscript carried no earlier check', () => {
    const result = classifyVerification({
      ...base,
      verification: verified(),
      previousVerifiedAt: null,
    });

    expect(result.status).toBe('fresh');
    expect(result.reason).toMatch(/no earlier verification/);
  });

  it('is stale when it resolves but the stored check is older than the limit', () => {
    const result = classifyVerification({
      ...base,
      verification: verified(),
      previousVerifiedAt: daysAgo(45),
    });

    expect(result.status).toBe('stale');
    expect(result.reason).toMatch(/45 days old \(limit 30\)/);
  });

  it('is mismatch when the DOI resolves to a different title', () => {
    const result = classifyVerification({
      ...base,
      verification: verified({
        verified: false,
        provider: undefined,
        paper: undefined,
        reason: 'crossref: title does not match the expected reference',
        candidate: {
          title: 'A completely different paper about laminar flow',
          similarity: 0.14,
          provider: 'crossref',
        },
      }),
      previousVerifiedAt: daysAgo(3),
    });

    expect(result.status).toBe('mismatch');
    expect(result.reason).toContain('different title');
    expect(result.reason).toContain('0.14');
    expect(result.reason).toContain('laminar flow');
    expect(result.titleSimilarity).toBe(0.14);
  });

  it('is broken when the DOI does not resolve and no candidate was returned', () => {
    const result = classifyVerification({
      ...base,
      verification: verified({
        verified: false,
        provider: undefined,
        paper: undefined,
        reason: 'DOI not found in Crossref or Semantic Scholar',
      }),
      previousVerifiedAt: daysAgo(3),
    });

    expect(result.status).toBe('broken');
    expect(result.reason).toBe('DOI not found in Crossref or Semantic Scholar');
  });
});

describe('overallStanding', () => {
  it('is unchecked with no results', () => {
    expect(overallStanding([])).toBe('unchecked');
  });

  it('is current only when every result is fresh', () => {
    expect(overallStanding([{ status: 'fresh' }, { status: 'fresh' }])).toBe('current');
  });

  it('lets a broken reference outrank everything else', () => {
    expect(
      overallStanding([{ status: 'fresh' }, { status: 'unverified' }, { status: 'broken' }]),
    ).toBe('attention');
    expect(overallStanding([{ status: 'mismatch' }])).toBe('attention');
  });

  it('does not call a partially checked list current', () => {
    expect(overallStanding([{ status: 'fresh' }, { status: 'unverified' }])).toBe('unverified');
    expect(overallStanding([{ status: 'fresh' }, { status: 'stale' }])).toBe('stale');
  });
});

describe('ageInDays', () => {
  it('counts whole days and never goes negative', () => {
    expect(ageInDays(daysAgo(3), NOW)).toBe(3);
    expect(ageInDays('2026-12-01T00:00:00.000Z', NOW)).toBe(0);
    expect(ageInDays('not a date', NOW)).toBe(0);
  });
});

/* ─────────────────────────── stage-8 blockers ───────────────────────────── */

describe('referenceBlockers', () => {
  const payload = {
    stage: 'reference-recheck',
    schemaVersion: 1,
    runId: 'run-1',
    checkedAt: NOW.toISOString(),
    offline: false,
    maxAgeDays: 30,
    results: [],
    summary: { fresh: 0, stale: 0, broken: 0, mismatch: 0, unverified: 0, total: 0 },
  } as const;

  it('says nothing about a fresh manuscript that was never re-checked', () => {
    expect(
      referenceBlockers({
        manuscriptGeneratedAt: daysAgo(2),
        now: NOW,
        maxAgeDays: 30,
        recheck: null,
      }),
    ).toEqual([]);
  });

  it('asks for a re-check once the manuscript is older than the limit', () => {
    const blockers = referenceBlockers({
      manuscriptGeneratedAt: daysAgo(40),
      now: NOW,
      maxAgeDays: 30,
      recheck: null,
    });

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/references have not been re-verified in this run/);
    expect(blockers[0]).toMatch(/40 days old/);
  });

  it('turns a broken or mismatched reference into a named blocker', () => {
    const blockers = referenceBlockers({
      manuscriptGeneratedAt: daysAgo(1),
      now: NOW,
      maxAgeDays: 30,
      recheck: {
        ...payload,
        results: [
          {
            key: 'ref-01',
            doi: '10.2514/1.j060001',
            title: 'x',
            status: 'broken',
            reason: 'DOI not found in Crossref',
            provider: null,
            titleSimilarity: null,
            previousVerifiedAt: daysAgo(60),
          },
          {
            key: 'ref-02',
            doi: '10.1/other',
            title: 'y',
            status: 'mismatch',
            reason: 'resolves to a different title',
            provider: 'crossref',
            titleSimilarity: 0.1,
            previousVerifiedAt: daysAgo(60),
          },
          {
            key: 'ref-03',
            doi: null,
            title: 'z',
            status: 'unverified',
            reason: 'no DOI',
            provider: null,
            titleSimilarity: null,
            previousVerifiedAt: null,
          },
        ],
      },
    });

    expect(blockers).toHaveLength(2);
    expect(blockers[0]).toContain('ref-01');
    expect(blockers[0]).toContain('10.2514/1.j060001');
    expect(blockers[0]).toMatch(/no longer resolves/);
    expect(blockers[1]).toContain('ref-02');
    expect(blockers[1]).toMatch(/different paper/);
  });

  it('reports a re-check that is itself older than the limit', () => {
    const blockers = referenceBlockers({
      manuscriptGeneratedAt: daysAgo(5),
      now: NOW,
      maxAgeDays: 30,
      recheck: { ...payload, checkedAt: daysAgo(31) },
    });

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/last DOI re-check is 31 days old/);
  });
});

/* ───────────────────────────── the real path ────────────────────────────── */

/** A provider that can be told, per DOI, whether it still resolves and how. */
function providerWith(outcomes: Record<string, Paper | null>): LiteratureProvider {
  return {
    name: 'crossref',
    requiresNetwork: true,
    search: async () => [],
    resolveDoi: async (doi) => outcomes[doi] ?? null,
  };
}

function manuscriptPayload(): ManuscriptPayload {
  const record = (index: number, doi: string | null, title: string, verifiedAt: string | null) => ({
    key: `ref-${String(index).padStart(2, '0')}`,
    index,
    doi,
    title,
    authors: ['A. Author'],
    year: 2024,
    venue: 'AIAA Journal',
    volume: null,
    pages: null,
    publisher: null,
    url: doi ? `https://doi.org/${doi}` : null,
    verified: {
      verifiedAt,
      provider: verifiedAt ? ('crossref' as const) : null,
      titleSimilarity: 1,
    },
  });

  return {
    stage: 'paper-synthesis',
    schemaVersion: 2,
    title: 'Transonic drag prediction: a verification-first study',
    journal: 'AIAA Journal',
    journalId: 'aiaa-journal',
    sections: [{ heading: 'Results', body: 'The drag coefficient is 0.4264.' }],
    abstract: 'A drag coefficient of 0.4264 is reported.',
    wordCount: 20,
    referenceCount: 2,
    references: [
      {
        index: 1,
        doi: '10.2514/1.j060001',
        citation: 'A. Author, AIAA Journal, 2024.',
        record: record(
          1,
          '10.2514/1.j060001',
          'Transonic drag prediction on unstructured meshes',
          daysAgo(40),
        ),
      },
      {
        index: 2,
        doi: null as unknown as string,
        citation: 'Reference with no DOI.',
        record: record(2, null, 'A reference nobody resolved', null),
      },
    ],
    numbers: { dragCoefficient: 0.4264 },
    generatedAt: daysAgo(40),
    synthetic: true,
  } as ManuscriptPayload;
}

async function seedRun(runId = 'run-1'): Promise<ManuscriptPayload> {
  const payload = manuscriptPayload();
  await registry.append({
    kind: 'manuscript',
    runId,
    stageId: 5,
    label: 'manuscript',
    payload,
    createdAt: daysAgo(40),
  });
  return payload;
}

describe('the acceptance path', () => {
  it('breaks the DOI of a generated manuscript with exactly one new record', async () => {
    // One provider, alive at generation time and gone afterwards: the same
    // transition a retracted paper or a dead registration makes in the wild.
    let alive = true;
    const provider: LiteratureProvider = {
      name: 'crossref',
      requiresNetwork: true,
      search: async () => (alive ? [paper()] : []),
      resolveDoi: async (doi) => (alive && doi === paper().doi ? paper() : null),
    };

    const orchestrator = new Orchestrator({
      runs: new RunRepository(join(directory, 'runs')),
      registry,
      audit: new AuditLog(join(directory, 'audit.ndjson')),
      literature: new LiteratureService({ offline: false, providers: [provider] }),
      cfd: new CfdService({
        su2: { available: false, binary: null },
        workDir: join(directory, 'cfd'),
      }),
      clock: () => NOW,
      newRunId: () => 'run-acceptance',
      defaultOptions: { paperLimit: 3, verifyTop: 2 },
    });

    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    // Stages 0–5, approving each gate: stage 5 writes the manuscript.
    for (let stageId = 0; stageId < 6; stageId += 1) {
      const advanced = await orchestrator.advance(run.id, 'tester');
      await orchestrator.approveGate(run.id, advanced.stage.gateId!, 'reviewer');
    }

    const before = await registry.list({ runId: run.id });
    const manuscript = before.filter((record) => record.kind === 'manuscript').at(-1)!;
    const fingerprints = canonicalJson(manuscript.payload);
    const dois = (manuscript.payload as ManuscriptPayload).references.filter(
      (reference) => reference.doi !== null,
    );
    expect(dois.length).toBeGreaterThan(0);

    alive = false;
    const outcome = await orchestrator.recheckReferences(run.id);

    expect(outcome.payload.summary.broken).toBe(dois.length);
    expect(outcome.payload.summary.fresh).toBe(0);
    expect(outcome.payload.offline).toBe(false);

    // Exactly one new record, and the manuscript it describes is untouched.
    const after = await registry.list({ runId: run.id });
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((record) => record.kind === 'doi-recheck')).toHaveLength(1);
    expect(
      canonicalJson(after.filter((record) => record.kind === 'manuscript').at(-1)!.payload),
    ).toBe(fingerprints);
    expect((await registry.verify()).valid).toBe(true);

    // The route the dashboard and an operator read says `broken`, not `current`.
    const status = await orchestrator.referenceStatus(run.id);
    expect(status.status).toBe('attention');
    expect(status.references.filter((entry) => entry.latest?.status === 'broken')).toHaveLength(
      dois.length,
    );
  });
});

describe('recheckRun', () => {
  it('marks a stored DOI broken once the provider stops resolving it, and changes nothing else', async () => {
    const runId = 'run-1';
    const payload = await seedRun(runId);
    const before = canonicalJson(payload);
    const recordsBefore = (await registry.list({ runId })).length;

    // Resolves at generation time; the registry no longer has it now.
    const literature = new LiteratureService({
      providers: [providerWith({ '10.2514/1.j060001': null })],
      offline: false,
      clock: () => NOW,
    });

    const outcome = await recheckRun(runId, {
      literature,
      registry,
      clock: () => NOW,
      maxAgeDays: 30,
    });

    expect(outcome.payload.results).toHaveLength(2);
    expect(outcome.payload.results[0]).toMatchObject({
      key: 'ref-01',
      doi: '10.2514/1.j060001',
      status: 'broken',
      previousVerifiedAt: daysAgo(40),
    });
    expect(outcome.payload.results[1]).toMatchObject({ key: 'ref-02', status: 'unverified' });
    expect(outcome.payload.summary).toEqual({
      fresh: 0,
      stale: 0,
      broken: 1,
      mismatch: 0,
      unverified: 1,
      total: 2,
    });

    // Exactly one new record, of the new kind, and the chain still verifies.
    const recordsAfter = await registry.list({ runId });
    expect(recordsAfter).toHaveLength(recordsBefore + 1);
    const appended = recordsAfter.at(-1)!;
    expect(appended.kind).toBe('doi-recheck');
    expect(appended.stageId).toBeNull();
    expect((await registry.verify()).valid).toBe(true);

    // The manuscript payload is byte-identical: a re-check is a new fact, never
    // an edit of the old one.
    const manuscript = recordsAfter.find((record) => record.kind === 'manuscript')!;
    expect(canonicalJson(manuscript.payload)).toBe(before);
  });

  it('marks a DOI that now points at another paper as a mismatch', async () => {
    const runId = 'run-2';
    await seedRun(runId);

    const literature = new LiteratureService({
      providers: [
        providerWith({
          '10.2514/1.j060001': paper({
            title: 'Laminar separation on a swept wing at low Reynolds number',
          }),
        }),
      ],
      offline: false,
      clock: () => NOW,
    });

    const outcome = await recheckRun(runId, {
      literature,
      registry,
      clock: () => NOW,
      maxAgeDays: 30,
    });

    expect(outcome.payload.results[0]).toMatchObject({ status: 'mismatch' });
    expect(outcome.payload.results[0]!.reason).toMatch(/different title/);
    expect(outcome.payload.summary.mismatch).toBe(1);
  });

  it('reports a reference that still resolves as stale when the stored check is old', async () => {
    const runId = 'run-3';
    await seedRun(runId);

    const literature = new LiteratureService({
      providers: [providerWith({ '10.2514/1.j060001': paper() })],
      offline: false,
      clock: () => NOW,
    });

    const outcome = await recheckRun(runId, {
      literature,
      registry,
      clock: () => NOW,
      maxAgeDays: 30,
    });

    expect(outcome.payload.results[0]).toMatchObject({ status: 'stale', provider: 'crossref' });
    expect(outcome.payload.summary.fresh).toBe(0);
  });

  it('never reports an offline re-check as fresh', async () => {
    const runId = 'run-4';
    await seedRun(runId);

    const literature = new LiteratureService({ providers: [], offline: true, clock: () => NOW });
    const outcome = await recheckRun(runId, {
      literature,
      registry,
      clock: () => NOW,
      maxAgeDays: 30,
    });

    expect(outcome.payload.offline).toBe(true);
    expect(outcome.payload.summary.fresh).toBe(0);
    expect(outcome.payload.summary.stale).toBe(0);
    expect(outcome.payload.results.every((result) => result.status === 'unverified')).toBe(true);
    for (const result of outcome.payload.results) {
      expect(result.reason ?? '').not.toMatch(/\bverified\b/i);
    }
  });

  it('refuses a run that has no manuscript', async () => {
    const literature = new LiteratureService({ providers: [], offline: true, clock: () => NOW });
    await expect(
      recheckRun('run-empty', { literature, registry, clock: () => NOW, maxAgeDays: 30 }),
    ).rejects.toThrow(/no manuscript record/);
  });
});

describe('referenceStatus', () => {
  it('says unchecked before the first re-check and names the newest after it', async () => {
    const runId = 'run-5';
    const payload = await seedRun(runId);

    const before = referenceStatus({ runId, manuscriptPayload: payload, rechecks: [] });
    expect(before.status).toBe('unchecked');
    expect(before.checkedAt).toBeNull();
    expect(before.rechecks).toBe(0);
    expect(before.references).toHaveLength(2);
    expect(before.references[0]!.latest).toBeNull();
    expect(before.references[0]!.citation).toBe('A. Author, AIAA Journal, 2024.');

    const literature = new LiteratureService({
      providers: [providerWith({ '10.2514/1.j060001': null })],
      offline: false,
      clock: () => NOW,
    });
    const { record } = await recheckRun(runId, {
      literature,
      registry,
      clock: () => NOW,
      maxAgeDays: 30,
    });

    const after = referenceStatus({
      runId,
      manuscriptPayload: payload,
      rechecks: await registry.list({ runId, kind: 'doi-recheck' }),
    });
    expect(after.status).toBe('attention');
    expect(after.rechecks).toBe(1);
    expect(after.checkedAt).toBe(NOW.toISOString());
    expect(after.references[0]!.latest).toMatchObject({
      status: 'broken',
      seq: record.seq,
      checkedAt: NOW.toISOString(),
    });
    expect(after.references[1]!.latest).toMatchObject({ status: 'unverified' });
  });

  it('summarises counts without rounding a problem away', () => {
    expect(
      summarise([
        {
          key: 'a',
          doi: '10.1/a',
          title: null,
          status: 'fresh',
          reason: null,
          provider: 'crossref',
          titleSimilarity: 1,
          previousVerifiedAt: null,
        },
        {
          key: 'b',
          doi: '10.1/b',
          title: null,
          status: 'broken',
          reason: 'gone',
          provider: null,
          titleSimilarity: null,
          previousVerifiedAt: null,
        },
      ]),
    ).toEqual({ fresh: 1, stale: 0, broken: 1, mismatch: 0, unverified: 0, total: 2 });
  });
});
