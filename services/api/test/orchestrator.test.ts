// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PIPELINE_STAGES, STAGE_COUNT } from '@aeroscribe/pipeline';
import { createFilesystemBlobStore } from '../src/blob';
import { CfdService } from '../src/cfd';
import { ApiError } from '../src/errors';
import { LiteratureService } from '../src/literature';
import { Orchestrator, assertVersionedPayload } from '../src/orchestrator';
import { createLogger } from '../src/lib/logger';
import { FilesystemAuditStore } from '../src/store';
import { FilesystemEvidenceStore } from '../src/store';
import { FilesystemRunStore } from '../src/store';

let directory: string;
let registry: FilesystemEvidenceStore;
let runs: FilesystemRunStore;
let audit: FilesystemAuditStore;
let orchestrator: Orchestrator;
let ids: string[];
let nowMs: number;

function build(dataDir = directory): Orchestrator {
  // Same instances as the test body, so assertions see what the orchestrator wrote.
  if (dataDir === directory) {
    runs = new FilesystemRunStore(join(dataDir, 'runs'));
    registry = new FilesystemEvidenceStore(join(dataDir, 'registry.ndjson'));
    audit = new FilesystemAuditStore(join(dataDir, 'audit.ndjson'));
  }
  return new Orchestrator({
    blobs: createFilesystemBlobStore({ dataDir: dataDir }),
    runs,
    registry,
    audit,
    literature: new LiteratureService({ offline: true, providers: [] }),
    cfd: new CfdService({ su2: { available: false, binary: null }, workDir: join(dataDir, 'cfd') }),
    newRunId: () => ids.shift() ?? 'run-fallback',
    // A clock that advances on every read: ordering assertions then test the
    // contract ("newest first") instead of whichever millisecond the machine
    // managed to land two writes in.
    clock: () => new Date((nowMs += 1_000)),
    defaultOptions: { paperLimit: 3, verifyTop: 0 },
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-orch-'));
  ids = ['run-1', 'run-2', 'run-3'];
  nowMs = Date.parse('2026-10-30T09:00:00.000Z');
  orchestrator = build();
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Advance the current stage, then approve its gate. Returns the final run. */
async function advanceAndApprove(runId: string) {
  const advanced = await orchestrator.advance(runId, 'tester');
  const gateId = advanced.stage.gateId!;
  const approved = await orchestrator.approveGate(runId, gateId, 'reviewer');
  return { advanced, approved };
}

describe('createRun', () => {
  it('rejects a topic that is too short to research', async () => {
    await expect(orchestrator.createRun({ topic: 'drag' })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });

  it('persists the run, its options and an audit entry', async () => {
    const run = await orchestrator.createRun({
      topic: 'transonic wing drag prediction',
      researcher: 'ana',
    });

    expect(run.id).toBe('run-1');
    expect(run.currentStage).toBe(0);
    expect(run.stages).toHaveLength(STAGE_COUNT);
    expect(run.stages[0]!.status).toBe('running');

    expect(await runs.get('run-1')).toMatchObject({ topic: 'transonic wing drag prediction' });
    expect(await runs.getOptions('run-1')).toMatchObject({ paperLimit: 3, verifyTop: 0 });

    const { entries } = await audit.read({ runId: 'run-1' });
    expect(entries.map((entry) => entry.action)).toEqual(['run.created']);
    expect(entries[0]!.actor).toBe('ana');
  });

  it('lists runs newest first', async () => {
    await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    await orchestrator.createRun({ topic: 'supersonic inlet buzz' });

    const list = await orchestrator.listRuns();
    expect(list.map((run) => run.id)).toEqual(['run-2', 'run-1']);
    expect(list[0]!.createdAt > list[1]!.createdAt).toBe(true);
  });
});

describe('a full nine-stage run', () => {
  it('advances all nine stages and parks each one at its gate', async () => {
    const created = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });

    const kinds: string[] = [];
    for (let stageId = 0; stageId < STAGE_COUNT; stageId += 1) {
      const advanced = await orchestrator.advance(created.id, 'tester');
      expect(advanced.stage.id).toBe(stageId);
      expect(advanced.evidenceSeq).not.toBeNull();
      kinds.push((await registry.get(advanced.evidenceSeq!))!.kind);

      if (stageId < STAGE_COUNT - 1) {
        expect(advanced.stage.status).toBe('gate_pending');
        const approved = await orchestrator.approveGate(
          created.id,
          advanced.stage.gateId!,
          'reviewer',
        );
        expect(approved.currentStage).toBe(stageId + 1);
        expect(approved.stages[stageId + 1]!.status).toBe('running');
      } else {
        // The last stage refuses to be submittable when the numbers are synthetic.
        expect(advanced.blocked!.reason).toMatch(/synthetic solver/);
        expect(advanced.stage.status).toBe('failed');
      }
    }

    expect(kinds).toEqual([
      'stage-output',
      'literature-search',
      'novelty-report',
      'stage-output',
      'cfd-run',
      'manuscript',
      'review-report',
      'compliance-report',
      'submission-package',
    ]);

    // Every record is versioned, so a reader can distinguish a renamed field
    // from a missing one.
    for (const record of await registry.list({ runId: created.id })) {
      const payload = record.payload as { schemaVersion?: unknown };
      expect(
        typeof payload.schemaVersion === 'number' &&
          Number.isInteger(payload.schemaVersion) &&
          payload.schemaVersion >= 1,
        `record ${record.seq} (${record.kind}) has no schemaVersion`,
      ).toBe(true);
    }

    const final = await orchestrator.getRun(created.id);
    expect(final.stages.slice(0, 8).every((stage) => stage.status === 'completed')).toBe(true);
    expect(final.stages[8]).toMatchObject({ status: 'failed' });
    expect(final.stages[8]!.gateApproved).not.toBe(true);
    expect(final.status).toBe('failed');
    expect((await registry.verify()).valid).toBe(true);
  });

  it('appends one evidence record per stage, plus the plan and the typeset manuscript', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });

    for (let stageId = 0; stageId < STAGE_COUNT; stageId += 1) {
      await orchestrator.advance(run.id);
      const current = await orchestrator.getRun(run.id);
      if (current.stages[stageId]!.status === 'gate_pending') {
        await orchestrator.approveGate(run.id, PIPELINE_STAGES[stageId]!.gateId);
      }
    }

    const records = await orchestrator.evidence(run.id);
    // Nine stage records, the manuscript plan stage 5 writes before its own
    // record, and the render stage 8 appends after its own.
    expect(records).toHaveLength(STAGE_COUNT + 2);
    expect(records.map((record) => record.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(records.every((record) => record.runId === run.id)).toBe(true);

    // Stage 8 appends its own record and the render it produced, in that order.
    const renders = records.filter((record) => record.kind === 'manuscript-render');
    expect(renders).toHaveLength(1);
    expect(renders[0]!.stageId).toBe(STAGE_COUNT - 1);
    expect(renders[0]!.seq).toBe(records.length - 1);

    // Stage 5 writes the plan first and the manuscript second, so the manuscript
    // can name the plan it was rendered from rather than the other way round.
    const plan = records.find((record) => record.kind === 'manuscript-plan')!;
    const manuscript = records.find((record) => record.kind === 'manuscript')!;
    expect(plan.seq).toBe(manuscript.seq - 1);
    expect(plan.stageId).toBe(5);
    expect((manuscript.payload as { planRef: { seq: number; hash: string } }).planRef).toEqual({
      seq: plan.seq,
      hash: plan.payloadHash,
    });

    const stageRecords = records.filter(
      (record) => record.kind !== 'manuscript-render' && record.kind !== 'manuscript-plan',
    );
    expect(stageRecords.map((record) => record.stageId)).toEqual(
      PIPELINE_STAGES.map((stage) => stage.id),
    );
  });

  it('blocks submission when a stored DOI no longer resolves, and says which one', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    for (let stageId = 0; stageId < STAGE_COUNT - 1; stageId += 1) {
      await advanceAndApprove(run.id);
    }

    // What a live re-check would have written: the DOI stage 5 resolved is gone.
    await registry.append({
      kind: 'doi-recheck',
      runId: run.id,
      stageId: null,
      label: 'seeded re-check',
      payload: {
        stage: 'reference-recheck',
        schemaVersion: 1,
        runId: run.id,
        checkedAt: new Date(nowMs + 1_000).toISOString(),
        offline: false,
        maxAgeDays: 30,
        results: [
          {
            key: 'ref-01',
            doi: '10.2514/1.j060001',
            title: 'Transonic drag prediction on unstructured meshes',
            status: 'broken',
            reason: 'DOI not found in Crossref or Semantic Scholar',
            provider: null,
            titleSimilarity: null,
            previousVerifiedAt: new Date(nowMs - 40 * 86_400_000).toISOString(),
          },
        ],
        summary: { fresh: 0, stale: 0, broken: 1, mismatch: 0, unverified: 0, total: 1 },
      },
    });

    const advanced = await orchestrator.advance(run.id);

    expect(advanced.blocked).not.toBeNull();
    expect(advanced.blocked!.reason).toMatch(/reference ref-01 \(10\.2514\/1\.j060001\)/);
    expect(advanced.blocked!.reason).toMatch(/no longer resolves/);
    // The run card says the references were re-checked and found wanting, rather
    // than implying they are simply unverified.
    expect(advanced.stage.metrics?.references).toBe('re-checked: problems');

    const [packaged] = await orchestrator.evidence(run.id, 'submission-package');
    const submission = (packaged!.payload as { submission: { blockers: string[] } }).submission;
    expect(submission.blockers).toContain(
      'reference ref-01 (10.2514/1.j060001) no longer resolves: DOI not found in Crossref or Semantic Scholar',
    );
  });

  it('asks for a re-check once the manuscript is older than the limit', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    for (let stageId = 0; stageId < STAGE_COUNT - 1; stageId += 1) {
      await advanceAndApprove(run.id);
    }

    // The manuscript was generated at the fixed 2026-10-30 clock. Run stage 8 six
    // weeks later, against the same data, with no re-check on record: the
    // generation-time verification is now older than the 30-day limit.
    const later = new Orchestrator({
      blobs: createFilesystemBlobStore({ dataDir: directory }),
      runs,
      registry,
      audit,
      literature: new LiteratureService({ offline: true, providers: [] }),
      cfd: new CfdService({
        su2: { available: false, binary: null },
        workDir: join(directory, 'cfd'),
      }),
      clock: () => new Date('2026-12-10T09:00:00.000Z'),
      newRunId: () => 'run-later',
    });

    const advanced = await later.advance(run.id);
    expect(advanced.stage.metrics?.references).toBe('generation-time only');

    const [packaged] = await later.evidence(run.id, 'submission-package');
    const submission = (packaged!.payload as { submission: { blockers: string[] } }).submission;
    expect(
      submission.blockers.some((blocker) =>
        /references have not been re-verified in this run/.test(blocker),
      ),
    ).toBe(true);
  });

  it('audits every transition and keeps the chain verifiable', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    await advanceAndApprove(run.id);

    const actions = (await audit.read({ runId: run.id })).entries.map((entry) => entry.action);
    expect(actions).toEqual(['run.created', 'run.advanced', 'evidence.appended', 'gate.approved']);

    expect((await audit.read()).malformed).toBe(0);
  });

  it('labels the synthetic manuscript and blocks its submission', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    for (let stageId = 0; stageId < STAGE_COUNT - 1; stageId += 1) {
      await advanceAndApprove(run.id);
    }
    await orchestrator.advance(run.id);

    const [manuscript] = await orchestrator.evidence(run.id, 'manuscript');
    const payload = manuscript!.payload as {
      synthetic: boolean;
      sections: Array<{ heading: string }>;
      referenceCount: number;
      numbers: Record<string, number>;
    };

    expect(payload.synthetic).toBe(true);
    expect(payload.sections.map((section) => section.heading)).toContain('AI use disclosure');
    // Offline fixtures never carry a DOI, so nothing can be cited as verified.
    expect(payload.referenceCount).toBe(0);

    const [cfd] = await orchestrator.evidence(run.id, 'cfd-run');
    expect((cfd!.payload as { solver: string }).solver).toBe('synthetic');
    expect((cfd!.payload as { disclaimer?: string }).disclaimer).toMatch(
      /must not be quoted as a physical result/i,
    );

    const [packaged] = await orchestrator.evidence(run.id, 'submission-package');
    const submission = (
      packaged!.payload as {
        submission: {
          status: string;
          blockers: string[];
          files: Array<{ name: string; sha256: string; bytes: number | null }>;
        };
      }
    ).submission;
    expect(submission.status).toBe('blocked');
    expect(submission.blockers).toContain('the results come from the synthetic solver');

    // The manifest describes artefacts that really exist as canonical JSON: the
    // size is measured, not left null, and every digest is a SHA-256.
    expect(submission.files.length).toBeGreaterThan(6);
    for (const file of submission.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThan(0);
    }
  });
});

describe('gate discipline', () => {
  it('refuses to advance past an unapproved gate', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    await orchestrator.advance(run.id);

    const error = await orchestrator.advance(run.id).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'conflict' });
    expect((error as ApiError).message).toMatch(/waiting for gate GATE-0/);
  });

  it('refuses to approve a gate that is not the one currently open', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });

    // Nothing executed yet: stage 0 is running, not gate_pending.
    await expect(orchestrator.approveGate(run.id, 'GATE-0')).rejects.toMatchObject({ status: 409 });

    await orchestrator.advance(run.id);
    await expect(orchestrator.approveGate(run.id, 'GATE-3')).rejects.toMatchObject({ status: 409 });
    await expect(orchestrator.approveGate(run.id, 'GATE-0')).resolves.toMatchObject({
      status: 'running',
    });
  });

  it('sends a stage back for revision and re-runs it on the same gate', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    await orchestrator.advance(run.id);

    const revised = await orchestrator.requestRevision(
      run.id,
      'GATE-0',
      'reviewer',
      'Sharpen the scope.',
    );
    expect(revised.currentStage).toBe(0);
    expect(revised.stages[0]).toMatchObject({
      status: 'running',
      gateApproved: false,
      revisionCount: 1,
    });

    const rerun = await orchestrator.advance(run.id);
    expect(rerun.stage.id).toBe(0);
    expect(rerun.stage.status).toBe('gate_pending');
    expect(rerun.stage.revisionCount).toBe(1);

    const approved = await orchestrator.approveGate(run.id, 'GATE-0');
    expect(approved.currentStage).toBe(1);

    const { entries } = await audit.read({ runId: run.id, action: 'gate.rejected' });
    expect(entries[0]!.detail).toMatchObject({ gateId: 'GATE-0', note: 'Sharpen the scope.' });
  });

  it('404s for an unknown run', async () => {
    await expect(orchestrator.advance('run-nope')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    await expect(orchestrator.getRun('run-nope')).rejects.toMatchObject({ status: 404 });
    await expect(orchestrator.evidence('run-nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('restart durability', () => {
  it('reloads options and continues a run after a fresh process', async () => {
    const run = await orchestrator.createRun({
      topic: 'transonic wing drag prediction',
      options: { paperLimit: 2, quantity: 'lift coefficient' },
    });
    await advanceAndApprove(run.id);

    // Simulate a deploy: brand new objects over the same data directory.
    orchestrator = build();
    const resumed = await orchestrator.getRun(run.id);
    expect(resumed.currentStage).toBe(1);

    const advanced = await orchestrator.advance(run.id);
    expect(advanced.stage.id).toBe(1);

    const [literature] = await orchestrator.evidence(run.id, 'literature-search');
    expect((literature!.payload as { papersFound: number }).papersFound).toBeLessThanOrEqual(2);
    await orchestrator.approveGate(run.id, 'GATE-1');

    for (let stageId = 2; stageId < STAGE_COUNT - 1; stageId += 1) {
      await advanceAndApprove(run.id);
    }
    await orchestrator.advance(run.id);
    const [cfd] = await orchestrator.evidence(run.id, 'cfd-run');
    expect((cfd!.payload as { quantity: string }).quantity).toBe('lift coefficient');
    expect((await orchestrator.verifyRegistry()).valid).toBe(true);
  });

  it('never leaves a half-written run file behind', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    await orchestrator.advance(run.id);

    const files = await readdir(join(directory, 'runs'));
    expect(files.sort()).toEqual(['run-1.json', 'run-1.options.json']);

    const parsed = JSON.parse(await readFile(join(directory, 'runs', 'run-1.json'), 'utf8'));
    expect(parsed.stages).toHaveLength(STAGE_COUNT);
  });
});

describe('failure handling', () => {
  it('marks the stage failed and rethrows when a handler throws', async () => {
    const broken = new Orchestrator({
      blobs: createFilesystemBlobStore({ dataDir: directory }),
      runs,
      registry,
      audit,
      literature: new LiteratureService({ offline: true, providers: [] }),
      cfd: {
        // A CFD service that fails the way a missing solver does.
        run: async () => {
          throw new ApiError(503, 'capability_unavailable', 'SU2 is not installed.');
        },
        describe: () => ({ su2: { available: false, binary: null }, offline: true }),
      } as unknown as CfdService,
      newRunId: () => 'run-broken',
    });

    const run = await broken.createRun({ topic: 'transonic wing drag prediction' });
    for (let stageId = 0; stageId < 4; stageId += 1) {
      await broken.advance(run.id);
      await broken.approveGate(run.id, PIPELINE_STAGES[stageId]!.gateId);
    }

    await expect(broken.advance(run.id)).rejects.toMatchObject({ status: 503 });

    const failed = await broken.getRun(run.id);
    expect(failed.stages[4]).toMatchObject({ status: 'failed' });
    expect(failed.status).toBe('failed');

    const { entries } = await audit.read({ runId: run.id });
    expect(entries.at(-1)!.action).toBe('stage.blocked');

    // A failed stage never appended evidence, so the registry still verifies.
    expect(await registry.list({ runId: run.id })).toHaveLength(4);
    expect((await registry.verify()).valid).toBe(true);
  });
});

describe('stage logging', () => {
  it('pairs every stage start with an end that names the evidence it wrote', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const logged = new Orchestrator({
      blobs: createFilesystemBlobStore({ dataDir: directory }),
      runs,
      registry,
      audit,
      literature: new LiteratureService({ offline: true, providers: [] }),
      cfd: new CfdService({
        su2: { available: false, binary: null },
        workDir: join(directory, 'cfd'),
      }),
      newRunId: () => 'run-logged',
      defaultOptions: { paperLimit: 3, verifyTop: 0 },
      logger: createLogger({
        level: 'debug',
        sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
      }),
    });

    const run = await logged.createRun({ topic: 'transonic wing drag prediction' });
    const advanced = await logged.advance(run.id);

    const start = lines.find((line) => line.event === 'stage.start');
    const end = lines.find((line) => line.event === 'stage.end');
    expect(start).toMatchObject({ run_id: run.id, stage_id: 0, stage: 'Topic Intelligence' });
    expect(end).toMatchObject({
      run_id: run.id,
      stage_id: 0,
      status: 'gate_pending',
      evidence_seq: advanced.evidenceSeq,
      evidence_kind: 'stage-output',
    });
    // A start/end pair per executed stage, no more.
    expect(lines.filter((line) => line.event === 'stage.start')).toHaveLength(1);
    expect(lines.filter((line) => line.event === 'stage.end')).toHaveLength(1);
  });

  it('logs a failed stage with its error and still marks the run failed', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const broken = new Orchestrator({
      blobs: createFilesystemBlobStore({ dataDir: directory }),
      runs,
      registry,
      audit,
      literature: new LiteratureService({ offline: true, providers: [] }),
      cfd: {
        run: async () => {
          throw new ApiError(503, 'capability_unavailable', 'SU2 is not installed.');
        },
        describe: () => ({ su2: { available: false, binary: null }, offline: true }),
      } as unknown as CfdService,
      newRunId: () => 'run-logged-failure',
      logger: createLogger({
        level: 'debug',
        sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
      }),
    });

    const run = await broken.createRun({ topic: 'transonic wing drag prediction' });
    for (let stageId = 0; stageId < 4; stageId += 1) {
      await broken.advance(run.id);
      await broken.approveGate(run.id, PIPELINE_STAGES[stageId]!.gateId);
    }
    await expect(broken.advance(run.id)).rejects.toMatchObject({ status: 503 });

    const failure = lines.find((line) => line.event === 'stage.failed');
    expect(failure).toMatchObject({
      run_id: run.id,
      stage_id: 4,
      code: 'capability_unavailable',
      status: 503,
    });
    expect(lines.some((line) => line.event === 'stage.end' && line.stage_id === 4)).toBe(false);
  });
});

describe('payload versioning', () => {
  it('accepts a positive integer version', () => {
    expect(() => assertVersionedPayload({ schemaVersion: 1 }, 0)).not.toThrow();
    expect(() => assertVersionedPayload({ schemaVersion: 2, anything: true }, 5)).not.toThrow();
  });

  it('rejects a payload that would enter the registry unversioned', () => {
    for (const payload of [
      {},
      { schemaVersion: 0 },
      { schemaVersion: 1.5 },
      { schemaVersion: '2' },
      null,
      'text',
      42,
    ]) {
      expect(() => assertVersionedPayload(payload, 3)).toThrow(/schemaVersion/);
    }
  });
});

describe('concurrent advances', () => {
  it('runs a stage once and rejects the second advance while it is in flight', async () => {
    // Hold the literature search open, which is what a real stage 1 does while
    // it waits on Crossref: the window in which a second request can arrive.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Resolves once the first advance is actually inside the stage handler.
    let entered!: () => void;
    const inHandler = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const literature = new LiteratureService({ offline: true, providers: [] });
    const original = literature.search.bind(literature);
    let calls = 0;
    literature.search = async (...args) => {
      calls += 1;
      entered();
      await gate;
      return original(...args);
    };

    const slow = new Orchestrator({
      blobs: createFilesystemBlobStore({ dataDir: directory }),
      runs,
      registry,
      audit,
      literature,
      cfd: new CfdService({
        su2: { available: false, binary: null },
        workDir: join(directory, 'cfd'),
      }),
      newRunId: () => 'run-slow',
      defaultOptions: { paperLimit: 3, verifyTop: 0 },
    });

    const run = await slow.createRun({ topic: 'transonic wing drag prediction' });
    await slow.advance(run.id);
    await slow.approveGate(run.id, PIPELINE_STAGES[0]!.gateId!);

    const first = slow.advance(run.id);
    // The second request arrives while the first is still blocked on Crossref.
    await inHandler;

    await expect(slow.advance(run.id)).rejects.toMatchObject({ status: 409 });
    expect(calls).toBe(1);

    release();
    const finished = await first;
    expect(finished.stage.id).toBe(1);

    // Exactly one stage-1 record: no duplicated evidence from the lost request.
    const records = await registry.list({ runId: run.id });
    expect(records.filter((record) => record.stageId === 1)).toHaveLength(1);
    expect((await registry.verify()).valid).toBe(true);

    // And the guard is released, so the run can move on.
    await slow.approveGate(run.id, PIPELINE_STAGES[1]!.gateId!);
    await expect(slow.advance(run.id)).resolves.toMatchObject({ stage: { id: 2 } });
  });

  it('resumes a stage that is only *recorded* as running, e.g. after a restart', async () => {
    const run = await orchestrator.createRun({ topic: 'laminar boundary layer transition' });
    // Simulate a process that died mid-stage: the file says running, no handler
    // is in flight in this instance.
    const stored = await runs.get(run.id);
    stored.stages[0]!.status = 'running';
    stored.status = 'running';
    await runs.save(stored);

    const resumed = await orchestrator.advance(run.id);
    expect(resumed.stage.status).toBe('gate_pending');
    expect((await registry.list({ runId: run.id })).filter((r) => r.stageId === 0)).toHaveLength(1);
  });
});
