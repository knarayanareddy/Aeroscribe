import { randomUUID } from 'node:crypto';
import {
  PIPELINE_STAGES,
  approveGate as approveGateReducer,
  createRun,
  requestRevision as requestRevisionReducer,
  type PipelineRun,
  type PipelineState,
  type StageInfo,
} from '@aeroscribe/pipeline';
import type { AuditAction, AuditStore, EvidenceKind, EvidenceStore, RunStore } from './store';
import type { CfdService } from './cfd';
import type { LiteratureService } from './literature';
import { ApiError, conflict, notFound } from './errors';
import { silentLogger, type Logger } from './lib/logger';
import { scopeFields } from './lib/requestContext';
import { DEFAULT_RUN_OPTIONS, type RunOptions, type StageHandler } from './agents/types';
import {
  contributionFraming,
  literatureArchaeology,
  noveltyDetection,
  topicIntelligence,
} from './agents/research';
import { evidenceGeneration } from './agents/evidence';
import { paperSynthesis } from './agents/writing';
import { complianceCheck, peerReview } from './agents/review';
import { knowledgeAndSubmission } from './agents/knowledge';
import type { ManuscriptRenderPayload } from '@aeroscribe/contract';
import { LatexService, NO_LATEX, type ArtefactKind } from './latex';
import { recheckRun, referenceStatus } from './references/recheck';

/** Matches the `AEROSCRIBE_DOI_MAX_AGE_DAYS` default in `config.ts`. */
export const DEFAULT_DOI_MAX_AGE_DAYS = 30;

/** One handler per stage id, in pipeline order. */
export const STAGE_HANDLERS: readonly StageHandler[] = [
  topicIntelligence,
  literatureArchaeology,
  noveltyDetection,
  contributionFraming,
  evidenceGeneration,
  paperSynthesis,
  peerReview,
  complianceCheck,
  knowledgeAndSubmission,
];

export interface OrchestratorOptions {
  runs: RunStore;
  registry: EvidenceStore;
  audit: AuditStore;
  literature: LiteratureService;
  cfd: CfdService;
  /**
   * Renders and typesets the manuscript. Optional so a test that never reaches
   * stage 8 need not describe a TeX toolchain; the default service has none,
   * which is exactly what an unconfigured server reports.
   */
  latex?: LatexService;
  /**
   * Staleness limit for a manuscript's DOI verifications, in days
   * (`AEROSCRIBE_DOI_MAX_AGE_DAYS`). Reported by re-checks and stage 8.
   */
  doiMaxAgeDays?: number;
  clock?: () => Date;
  newRunId?: () => string;
  defaultOptions?: Partial<RunOptions>;
  logger?: Logger;
}

export interface CreateRunRequest {
  topic: string;
  journal?: string;
  researcher?: string;
  options?: Partial<RunOptions>;
}

export interface AdvanceResult {
  run: PipelineRun;
  stage: StageInfo;
  evidenceSeq: number | null;
  blocked?: { reason: string };
}

/**
 * A stage payload must carry `schemaVersion` (a positive integer).
 *
 * Adding a field does not bump the version; renaming or changing the meaning of
 * one does. The check lives here rather than in the registry because the
 * registry is a generic append-only store, and because a handler that forgets
 * to version its output is a defect in the handler.
 */
export function assertVersionedPayload(payload: unknown, stageId: number): void {
  const version =
    typeof payload === 'object' && payload !== null
      ? (payload as { schemaVersion?: unknown }).schemaVersion
      : undefined;

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(
      `Stage ${stageId} returned a payload without a positive integer schemaVersion; refusing to record it.`,
    );
  }
}

/**
 * The pipeline orchestrator.
 *
 * Responsibilities, deliberately kept small: own the run lifecycle, invoke one
 * stage handler at a time, append exactly one evidence record per stage, write an
 * audit entry for every state change, and refuse to advance past a gate that a
 * human has not approved. The pure state transitions are delegated to
 * `@aeroscribe/pipeline`, so the reducer semantics the dashboard already tests
 * are the ones the server uses.
 */
export class Orchestrator {
  private readonly options: OrchestratorOptions;
  private readonly clock: () => Date;
  private readonly newRunId: () => string;
  private readonly optionsCache = new Map<string, RunOptions>();
  /** Lazily built when a caller supplied no `latex` service. */
  private defaultLatex?: LatexService;
  /**
   * Runs with a stage handler currently executing. A stage can take minutes
   * (a SU2 study spawns one solver process per mesh), and `advance` is an HTTP
   * endpoint: two clicks, or a retried request, would otherwise run the same
   * stage twice and append its evidence twice. A stage that is merely *recorded*
   * as running (after a crash) is not in this set and is resumed as before.
   */
  private readonly inFlight = new Set<string>();

  private readonly logger: Logger;

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.clock = options.clock ?? (() => new Date());
    this.newRunId = options.newRunId ?? (() => `run-${randomUUID()}`);
    this.logger = options.logger ?? silentLogger();
  }

  async createRun(request: CreateRunRequest): Promise<PipelineRun> {
    const topic = request.topic.trim();
    if (topic.length < 8) {
      throw new ApiError(
        400,
        'invalid_request',
        'Describe the research topic in at least 8 characters.',
      );
    }
    if (topic.length > 300) {
      // The topic is copied into every artefact, the manuscript title and the
      // audit trail; an unbounded string would be stored once per record.
      throw new ApiError(400, 'invalid_request', 'Keep the research topic under 300 characters.');
    }

    const journal = request.journal?.trim() || 'AIAA Journal';
    const run = createRun({ id: this.newRunId(), topic, journal, now: this.clock() });
    const researcher = request.researcher?.trim() || 'anonymous';

    const runOptions: RunOptions = {
      ...DEFAULT_RUN_OPTIONS,
      ...this.options.defaultOptions,
      ...request.options,
    };
    this.optionsCache.set(run.id, runOptions);

    await this.options.runs.save(run);
    await this.options.runs.saveOptions(run.id, runOptions);
    await this.options.audit.record({
      action: 'run.created',
      runId: run.id,
      actor: researcher,
      detail: { topic, journal },
    });

    return run;
  }

  async listRuns(): Promise<PipelineRun[]> {
    return this.options.runs.list();
  }

  async getRun(runId: string): Promise<PipelineRun> {
    const run = await this.options.runs.get(runId);
    if (!run) throw notFound(`No pipeline run with id ${runId}.`);
    return run;
  }

  /** Execute the run's current stage and park it at its gate. */
  async advance(runId: string, actor = 'anonymous'): Promise<AdvanceResult> {
    const run = await this.getRun(runId);

    const stage = run.stages.find((candidate) => candidate.id === run.currentStage);
    if (!stage) throw conflict('The run has no current stage.');

    if (stage.status === 'gate_pending') {
      throw conflict(
        `Stage ${stage.id} ("${stage.name}") is waiting for gate ${stage.gateId ?? 'approval'}. Approve or reject it before advancing.`,
      );
    }

    if (stage.status === 'completed') {
      throw conflict(`Stage ${stage.id} is already complete.`);
    }

    const handler = STAGE_HANDLERS[stage.id];
    if (!handler) throw conflict(`No handler is registered for stage ${stage.id}.`);

    if (this.inFlight.has(run.id)) {
      throw conflict(
        `A stage is already running for this run (stage ${run.currentStage}). Wait for it to finish before advancing again.`,
      );
    }
    this.inFlight.add(run.id);
    try {
      return await this.runStage({ run, stage, handler, actor });
    } finally {
      this.inFlight.delete(run.id);
    }
  }

  /** Executes one stage handler and records its outcome. Never called twice concurrently. */
  private async runStage({
    run,
    stage,
    handler,
    actor,
  }: {
    run: PipelineRun;
    stage: StageInfo;
    handler: StageHandler;
    actor: string;
  }): Promise<AdvanceResult> {
    const stageOptions = this.optionsCache.get(run.id) ??
      (await this.options.runs.getOptions<RunOptions>(run.id)) ?? { ...DEFAULT_RUN_OPTIONS };
    const runningStage: StageInfo = {
      ...stage,
      status: 'running',
      startedAt: stage.startedAt ?? this.clock().toISOString(),
      agentsActive: PIPELINE_STAGES[stage.id]?.agents ?? stage.agentsActive,
    };

    const runningRun = this.patchStage(run, runningStage, 'running');
    await this.options.runs.save(runningRun);
    this.logger.info('stage.start', {
      ...scopeFields(),
      run_id: run.id,
      stage_id: stage.id,
      stage: stage.name,
      attempt: (stage.revisionCount ?? 0) + 1,
    });

    try {
      const outcome = await handler({
        run: runningRun,
        stage: runningStage,
        literature: this.options.literature,
        cfd: this.options.cfd,
        latex: this.latex,
        doiMaxAgeDays: this.options.doiMaxAgeDays ?? DEFAULT_DOI_MAX_AGE_DAYS,
        registry: this.options.registry,
        now: this.clock,
        options: stageOptions,
      });

      // Every stored payload declares its own version, so a reader can tell a
      // renamed field from a missing one. This is the single place that turns
      // "remember to bump it" into something the code enforces.
      assertVersionedPayload(outcome.payload, stage.id);

      const record = await this.options.registry.append({
        kind: outcome.kind,
        runId: run.id,
        stageId: stage.id,
        label: outcome.label,
        payload: outcome.payload,
      });

      // A stage may describe an artefact as well as its transition. Appending
      // those records here keeps the registry the only writer, and keeps the
      // stage's `evidenceSeq` pointing at the record that summarises the stage.
      for (const extra of outcome.extra ?? []) {
        assertVersionedPayload(extra.payload, stage.id);
        const extraRecord = await this.options.registry.append({
          kind: extra.kind,
          runId: run.id,
          stageId: stage.id,
          label: extra.label,
          payload: extra.payload,
        });
        await this.options.audit.record({
          action: 'evidence.appended',
          runId: run.id,
          actor: 'orchestrator',
          detail: { seq: extraRecord.seq, kind: extraRecord.kind, hash: extraRecord.hash },
        });
      }

      const gatePending: StageInfo = {
        ...runningStage,
        status: outcome.blocked ? 'failed' : 'gate_pending',
        completedAt: this.clock().toISOString(),
        evidenceSeq: record.seq,
        metrics: { ...(stage.metrics ?? {}), ...outcome.metrics },
      };

      const nextRun = this.patchStage(
        runningRun,
        gatePending,
        outcome.blocked ? 'failed' : 'gate_pending',
      );

      await this.options.runs.save(nextRun);
      await this.options.audit.record({
        action: outcome.blocked ? 'stage.blocked' : 'run.advanced',
        runId: run.id,
        actor,
        detail: {
          stage: stage.id,
          evidenceSeq: record.seq,
          summary: outcome.summary,
          ...(outcome.blocked ? { reason: outcome.blocked.reason } : {}),
        },
      });
      await this.options.audit.record({
        action: 'evidence.appended',
        runId: run.id,
        actor: 'orchestrator',
        detail: { seq: record.seq, kind: record.kind, hash: record.hash },
      });

      this.logger.info('stage.end', {
        ...scopeFields(),
        run_id: run.id,
        stage_id: stage.id,
        stage: stage.name,
        status: gatePending.status,
        evidence_seq: record.seq,
        evidence_kind: record.kind,
        ...(outcome.blocked ? { blocked_reason: outcome.blocked.reason } : {}),
      });

      return {
        run: nextRun,
        stage: gatePending,
        evidenceSeq: record.seq,
        blocked: outcome.blocked,
      };
    } catch (error) {
      const failedStage: StageInfo = {
        ...runningStage,
        status: 'failed',
        completedAt: this.clock().toISOString(),
      };
      const failedRun = this.patchStage(runningRun, failedStage, 'failed');
      await this.options.runs.save(failedRun);
      await this.options.audit.record({
        action: 'stage.blocked',
        runId: run.id,
        actor,
        detail: { stage: stage.id, error: (error as Error).message },
      });
      this.logger.error('stage.failed', {
        ...scopeFields(),
        run_id: run.id,
        stage_id: stage.id,
        stage: stage.name,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}),
      });
      throw error;
    }
  }

  /** Human approval of a stage gate. Reuses the shared reducer. */
  async approveGate(runId: string, gateId: string, actor = 'anonymous') {
    const run = await this.getRun(runId);
    const stage = this.assertGate(run, gateId);

    const state: PipelineState = { runs: [run], activeRunId: run.id };
    const next = approveGateReducer(state, run.id, stage.id, this.clock().toISOString());
    const nextRun = next.runs[0]!;

    await this.options.runs.save(nextRun);
    await this.options.audit.record({
      action: 'gate.approved',
      runId,
      actor,
      detail: { gateId, stage: stage.id, stageName: stage.name },
    });

    return nextRun;
  }

  /** Human rejection: the stage is re-run and must pass the gate again. */
  async requestRevision(runId: string, gateId: string, actor = 'anonymous', note?: string) {
    const run = await this.getRun(runId);
    const stage = this.assertGate(run, gateId);

    const state: PipelineState = { runs: [run], activeRunId: run.id };
    const next = requestRevisionReducer(state, run.id, stage.id, this.clock().toISOString());
    const nextRun = next.runs[0]!;

    await this.options.runs.save(nextRun);
    await this.options.audit.record({
      action: 'gate.rejected',
      runId,
      actor,
      detail: { gateId, stage: stage.id, note: note ?? null },
    });

    return nextRun;
  }

  async evidence(runId: string, kind?: EvidenceKind) {
    await this.getRun(runId);
    return this.options.registry.list({ runId, kind });
  }

  async searchLiterature(query: string, limit: number) {
    const report = await this.options.literature.search(query, { limit });
    await this.options.audit.record({
      action: 'literature.searched',
      runId: null,
      actor: 'api',
      detail: {
        query: report.query,
        papers: report.papers.length,
        errors: report.errors.length,
        offline: this.options.literature.offline,
      },
    });
    return report;
  }

  async verifyDoi(doi: string, expectedTitle?: string) {
    const verification = await this.options.literature.verifyDoi(doi, { expectedTitle });
    await this.options.audit.record({
      action: 'doi.verified',
      runId: null,
      actor: 'api',
      detail: {
        doi: verification.normalised,
        verified: verification.verified,
        provider: verification.provider ?? null,
        reason: verification.reason ?? null,
      },
    });
    return verification;
  }

  /**
   * Re-resolve every DOI the run's manuscript cites and append one record.
   *
   * Appending, not mutating: the manuscript stays byte-identical, and the new
   * record is the evidence that the check happened now rather than at generation
   * time.
   */
  async recheckReferences(runId: string) {
    const run = await this.getRun(runId);
    if (run.id !== runId) throw conflict('The run could not be read.');

    const outcome = await recheckRun(runId, {
      literature: this.options.literature,
      registry: this.options.registry,
      clock: this.clock,
      maxAgeDays: this.options.doiMaxAgeDays ?? DEFAULT_DOI_MAX_AGE_DAYS,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/has no manuscript record/.test(message)) {
        throw conflict(
          'This run has no manuscript yet: stage 5 writes one, and only its references can be re-checked.',
        );
      }
      throw error;
    });

    await this.options.audit.record({
      action: 'doi.rechecked',
      runId,
      actor: 'api',
      detail: {
        seq: outcome.record.seq,
        checkedAt: outcome.payload.checkedAt,
        offline: outcome.payload.offline,
        ...outcome.payload.summary,
      },
    });

    this.logger.info('doi.rechecked', {
      ...scopeFields(),
      run_id: runId,
      evidence_seq: outcome.record.seq,
      offline: outcome.payload.offline,
      ...outcome.payload.summary,
    });

    return outcome;
  }

  private get latex(): LatexService {
    if (!this.options.latex) {
      this.defaultLatex ??= new LatexService({ latex: NO_LATEX });
      this.options.latex = this.defaultLatex;
    }
    return this.options.latex;
  }

  /**
   * The bytes behind a manuscript download, checked against the record.
   *
   * The route serves what is on disk, not a fresh render: what a reviewer
   * downloads must be the file the registry hashed. A mismatch is a 500, because
   * an artefact that no longer matches its record is not a client error.
   */
  async manuscriptArtefact(runId: string, kind: ArtefactKind) {
    const records = await this.evidence(runId);
    const render = records.filter((record) => record.kind === 'manuscript-render').at(-1);
    if (!render) {
      throw conflict(
        'This run has no rendered manuscript yet: stage 8 renders the LaTeX source and, when a toolchain is configured, the PDF.',
      );
    }

    const payload = render.payload as ManuscriptRenderPayload;
    const expected = kind === 'tex' ? payload.texSha256 : payload.pdf?.sha256;
    if (!expected) {
      // Ask the service for the file: when there is none it raises a 503 naming
      // the missing capability, which is the honest answer. If a file *does*
      // exist here it was never recorded, and serving it would be worse than
      // refusing — the fall-through below is intentional.
      await this.latex.read(runId, kind);
      throw conflict(
        'The manuscript-render record says no PDF was typeset for this run, so there is nothing to download.',
      );
    }

    const artefact = await this.latex.read(runId, kind);
    if (artefact.sha256 !== expected) {
      throw new ApiError(
        500,
        'artefact_mismatch',
        'The file on disk does not match the hash recorded in the evidence chain.',
        { expected, actual: artefact.sha256, kind },
      );
    }
    return artefact;
  }

  /** The run's references joined with its newest re-check. */
  async referenceStatus(runId: string) {
    const records = await this.evidence(runId);
    const manuscript = records.filter((record) => record.kind === 'manuscript').at(-1);
    if (!manuscript) {
      throw conflict(
        'This run has no manuscript yet: its references do not exist until stage 5 writes them.',
      );
    }
    return referenceStatus({
      runId,
      manuscriptPayload: manuscript.payload,
      rechecks: records.filter((record) => record.kind === 'doi-recheck'),
    });
  }

  /** Read the audit trail for a run (or the whole log) without writing to it. */
  async auditTrail(filter: { runId?: string; action?: AuditAction; limit?: number } = {}) {
    return this.options.audit.read(filter);
  }

  async verifyRegistry() {
    const result = await this.options.registry.verify();
    await this.options.audit.record({
      action: 'registry.verified',
      runId: null,
      actor: 'api',
      detail: { valid: result.valid, records: result.records, brokenAt: result.brokenAt ?? null },
    });
    return result;
  }

  private assertGate(run: PipelineRun, gateId: string): StageInfo {
    const stage = run.stages.find((candidate) => candidate.id === run.currentStage);
    if (!stage) throw conflict('The run has no current stage.');
    if (stage.status !== 'gate_pending') {
      throw conflict(
        `Stage ${stage.id} ("${stage.name}") is not waiting at a gate (status: ${stage.status}).`,
      );
    }
    if (stage.gateId !== gateId) {
      throw conflict(`The open gate is ${stage.gateId ?? 'unset'}, not ${gateId}.`);
    }
    return stage;
  }

  private patchStage(
    run: PipelineRun,
    stage: StageInfo,
    status: PipelineRun['status'],
  ): PipelineRun {
    return {
      ...run,
      status,
      currentStage: stage.id,
      updatedAt: this.clock().toISOString(),
      stages: run.stages.map((candidate) => (candidate.id === stage.id ? stage : candidate)),
    };
  }
}
