import { describe, expect, it } from 'vitest';
import {
  approveGate,
  createInitialState,
  pipelineReducer,
  requestRevision,
  selectRun,
} from './reducer';
import { STAGE_COUNT, createRun, createStages } from './stages';
import type { PipelineRun } from './types';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function gatePendingRun(): PipelineRun {
  const run = createRun({
    id: 'run-test',
    topic: 'Rotating detonation engine stability',
    journal: 'Journal of Propulsion and Power',
    now: new Date('2026-01-01T00:00:00Z'),
  });

  return {
    ...run,
    status: 'gate_pending',
    currentStage: 1,
    stages: run.stages.map((stage) => {
      if (stage.id < 1) return { ...stage, status: 'completed', gateApproved: true };
      if (stage.id === 1) return { ...stage, status: 'gate_pending', gateApproved: false };
      return stage;
    }),
  };
}

describe('createRun', () => {
  it('creates every stage from the shared stage definitions', () => {
    const run = createRun({ id: 'run-1', topic: '  Topic  ', journal: 'AIAA Journal' });

    expect(run.topic).toBe('Topic');
    expect(run.stages).toHaveLength(STAGE_COUNT);
    expect(run.stages[0]?.status).toBe('running');
    expect(run.stages.slice(1).every((stage) => stage.status === 'pending')).toBe(true);
    expect(run.currentStage).toBe(0);
    expect(run.status).toBe('running');
  });

  it('returns independent stage objects on every call', () => {
    const first = createStages();
    const second = createStages();
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]?.agentsActive).not.toBe(second[0]?.agentsActive);
  });
});

describe('approveGate', () => {
  it('advances the run and closes the gate', () => {
    const state = createInitialState([gatePendingRun()]);
    const next = approveGate(state, 'run-test', 1, '2026-01-01T01:00:00Z');
    const run = next.runs[0]!;

    expect(run.stages[1]?.status).toBe('completed');
    expect(run.stages[1]?.gateApproved).toBe(true);
    expect(run.stages[2]?.status).toBe('running');
    expect(run.currentStage).toBe(2);
    expect(run.status).toBe('running');
    expect(run.updatedAt).toBe('2026-01-01T01:00:00Z');
  });

  it('never mutates the input state or the fixture runs', () => {
    const frozenRun = deepFreeze(gatePendingRun());
    const state = deepFreeze(createInitialState([frozenRun]));

    expect(() => approveGate(state, 'run-test', 1)).not.toThrow();

    const after = approveGate(state, 'run-test', 1).runs[0]!;
    expect(state.runs[0]?.stages[1]?.status).toBe('gate_pending');
    expect(state.runs[0]?.stages[2]?.status).toBe('pending');
    expect(after.stages[1]).not.toBe(state.runs[0]?.stages[1]);
    expect(after.stages[3]).toBe(state.runs[0]?.stages[3]);
  });

  it('is a no-op for stages that are not awaiting a gate', () => {
    const state = createInitialState([gatePendingRun()]);
    const next = approveGate(state, 'run-test', 5);
    expect(next).toBe(state);
  });

  it('is a no-op for unknown runs', () => {
    const state = createInitialState([gatePendingRun()]);
    expect(approveGate(state, 'does-not-exist', 1)).toBe(state);
  });

  it('completes the run when the final gate is approved', () => {
    const run = gatePendingRun();
    const lastStage = run.stages.at(-1)!;
    const state = createInitialState([
      {
        ...run,
        currentStage: lastStage.id,
        stages: run.stages.map((stage) =>
          stage.id === lastStage.id
            ? { ...stage, status: 'gate_pending' as const }
            : { ...stage, status: 'completed' as const },
        ),
      },
    ]);

    const next = approveGate(state, 'run-test', lastStage.id).runs[0]!;
    expect(next.status).toBe('completed');
    expect(next.stages.at(-1)?.status).toBe('completed');
  });

  it('only touches the requested run', () => {
    const other = gatePendingRun();
    const state = createInitialState([gatePendingRun(), { ...other, id: 'run-other' }]);
    const next = approveGate(state, 'run-test', 1);
    expect(next.runs[1]).toBe(state.runs[1]);
  });
});

describe('requestRevision', () => {
  it('reopens the stage and records the revision', () => {
    const state = createInitialState([gatePendingRun()]);
    const next = requestRevision(state, 'run-test', 1).runs[0]!;

    expect(next.stages[1]?.status).toBe('running');
    expect(next.stages[1]?.gateApproved).toBe(false);
    expect(next.stages[1]?.revisionCount).toBe(1);
    expect(next.status).toBe('running');

    const twice = requestRevision(createInitialState([next]), 'run-test', 1);
    // Stage is running now, so the second call is a no-op.
    expect(twice.runs[0]?.stages[1]?.revisionCount).toBe(1);
  });
});

describe('pipelineReducer', () => {
  it('prepends new runs and selects them', () => {
    const state = createInitialState([gatePendingRun()]);
    const run = createRun({ id: 'run-new', topic: 'New topic', journal: 'AIAA Journal' });
    const next = pipelineReducer(state, { type: 'createRun', run });

    expect(next.runs[0]?.id).toBe('run-new');
    expect(next.activeRunId).toBe('run-new');
  });

  it('ignores selection of unknown runs', () => {
    const state = createInitialState([gatePendingRun()]);
    expect(selectRun(state, 'nope')).toBe(state);
  });

  it('returns the same state for unknown actions', () => {
    const state = createInitialState([gatePendingRun()]);
    // @ts-expect-error — exercising the default branch with an invalid action.
    expect(pipelineReducer(state, { type: 'nope' })).toBe(state);
  });
});
