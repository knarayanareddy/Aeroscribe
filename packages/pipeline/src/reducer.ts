import type { PipelineRun, StageInfo } from './types';

export interface PipelineState {
  runs: PipelineRun[];
  activeRunId: string | null;
}

export type PipelineAction =
  | { type: 'createRun'; run: PipelineRun }
  | { type: 'selectRun'; runId: string }
  | { type: 'approveGate'; runId: string; stageId: number; now?: string }
  | { type: 'requestRevision'; runId: string; stageId: number; now?: string };

export function createInitialState(
  runs: PipelineRun[],
  activeRunId: string | null = runs[0]?.id ?? null,
): PipelineState {
  return { runs, activeRunId };
}

/** Select a run by id, tolerating ids that are no longer present. */
export function selectRun(state: PipelineState, runId: string): PipelineState {
  if (!state.runs.some((run) => run.id === runId)) return state;
  return state.activeRunId === runId ? state : { ...state, activeRunId: runId };
}

/**
 * Replace one run immutably. `update` must not mutate the run it receives.
 */
function updateRun(
  state: PipelineState,
  runId: string,
  update: (run: PipelineRun, now: string) => PipelineRun,
  now: string,
): PipelineState {
  const index = state.runs.findIndex((run) => run.id === runId);
  if (index === -1) return state;

  const current = state.runs[index]!;
  const next = update(current, now);
  if (next === current) return state;

  const runs = state.runs.slice();
  runs[index] = next;
  return { ...state, runs };
}

/**
 * Approve the human gate on a stage.
 *
 * The approved stage becomes `completed`, the following stage starts running and
 * the run's `currentStage` moves on. When the last stage is approved the run is
 * marked `completed`. No argument is ever mutated: the reducer always returns
 * fresh objects, which keeps React state and the fixtures in
 * `apps/dashboard/src/data` separate (see `reducer.test.ts`).
 */
export function approveGate(state: PipelineState, runId: string, stageId: number, now?: string) {
  const timestamp = now ?? new Date().toISOString();
  return updateRun(
    state,
    runId,
    (run) => {
      const stage = run.stages.find((candidate) => candidate.id === stageId);
      if (!stage || stage.status !== 'gate_pending') return run;

      const stages: StageInfo[] = run.stages.map((candidate) => {
        if (candidate.id === stageId) {
          return {
            ...candidate,
            status: 'completed',
            gateApproved: true,
            completedAt: timestamp,
          };
        }
        if (candidate.id === stageId + 1 && candidate.status === 'pending') {
          return {
            ...candidate,
            status: 'running',
            startedAt: timestamp,
            agentsActive: [...candidate.agentsActive],
          };
        }
        return candidate;
      });

      const nextStage = stages.find((candidate) => candidate.id === stageId + 1);
      return {
        ...run,
        stages,
        currentStage: nextStage ? nextStage.id : stageId,
        status: nextStage ? 'running' : 'completed',
        updatedAt: timestamp,
      };
    },
    timestamp,
  );
}

/**
 * Send a stage back for revision: the gate stays closed, the stage runs again
 * and the revision counter increments so the review history is visible.
 */
export function requestRevision(
  state: PipelineState,
  runId: string,
  stageId: number,
  now?: string,
) {
  const timestamp = now ?? new Date().toISOString();
  return updateRun(
    state,
    runId,
    (run) => {
      const stage = run.stages.find((candidate) => candidate.id === stageId);
      if (!stage || stage.status !== 'gate_pending') return run;

      const stages = run.stages.map((candidate) =>
        candidate.id === stageId
          ? {
              ...candidate,
              status: 'running' as const,
              gateApproved: false,
              revisionCount: (candidate.revisionCount ?? 0) + 1,
            }
          : candidate,
      );

      return { ...run, stages, currentStage: stageId, status: 'running', updatedAt: timestamp };
    },
    timestamp,
  );
}

export function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'createRun':
      return { runs: [action.run, ...state.runs], activeRunId: action.run.id };
    case 'selectRun':
      return selectRun(state, action.runId);
    case 'approveGate':
      return approveGate(state, action.runId, action.stageId, action.now);
    case 'requestRevision':
      return requestRevision(state, action.runId, action.stageId, action.now);
    default:
      return state;
  }
}
