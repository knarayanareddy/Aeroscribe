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
import type { AuditAction, AuditLog } from './store/audit';
import type { EvidenceKind, EvidenceRegistry } from './store/registry';
import type { RunRepository } from './store/runs';
import type { CfdService } from './cfd';
import type { LiteratureService } from './literature';
import { ApiError, conflict, notFound } from './errors';
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
  runs: RunRepository;
  registry: EvidenceRegistry;
  audit: AuditLog;
  literature: LiteratureService;
  cfd: CfdService;
  clock?: () => Date;
  newRunId?: () => string;
  defaultOptions?: Partial<RunOptions>;
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
  /**
   * Runs with a stage handler currently executing. A stage can take minutes
   * (a SU2 study spawns one solver process per mesh), and `advance` is an HTTP
   * endpoint: two clicks, or a retried request, would otherwise run the same
   * stage twice and append its evidence twice. A stage that is merely *recorded*
   * as running (after a crash) is not in this set and is resumed as before.
   */
  private readonly inFlight = new Set<string>();

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.clock = options.clock ?? (() => new Date());
    this.newRunId = options.newRunId ?? (() => `run-${randomUUID()}`);
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

    try {
      const outcome = await handler({
        run: runningRun,
        stage: runningStage,
        literature: this.options.literature,
        cfd: this.options.cfd,
        registry: this.options.registry,
        now: this.clock,
        options: stageOptions,
      });

      const record = await this.options.registry.append({
        kind: outcome.kind,
        runId: run.id,
        stageId: stage.id,
        label: outcome.label,
        payload: outcome.payload,
      });

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
