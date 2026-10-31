import type { AuditResponse, Capabilities, EvidenceRecord } from '@aeroscribe/contract';
import {
  approveGate as approveGateAction,
  createInitialState,
  createRun as createRunModel,
  pipelineReducer,
  type PipelineRun,
} from '@aeroscribe/pipeline';
import { journalProfiles, mockPipelineRuns } from '../data/mockData';
import type { RunSource } from './source';

/**
 * The fixture source.
 *
 * It exists so the interface has two implementations and the views cannot
 * accidentally depend on HTTP. It applies the *same* reducer the prototype used
 * before, so approving a gate in fixture mode behaves exactly as it always did.
 *
 * What it deliberately cannot do: run a stage. `advance()` returns the run
 * unchanged and says so, because a fixture has no solver and no literature
 * search to run — pretending otherwise would be the same class of lie as a
 * fabricated result.
 */
export function createFixtureSource(seed: PipelineRun[] = mockPipelineRuns): RunSource {
  let state = createInitialState(seed, seed[0]?.id ?? null);

  const find = (id: string): PipelineRun => {
    const run = state.runs.find((candidate) => candidate.id === id);
    if (!run) throw new Error(`No fixture run "${id}".`);
    return run;
  };

  return {
    mode: 'fixtures',
    label: 'Fixtures · illustrative data',
    initialRuns: seed,

    listRuns: async () => state.runs,
    getRun: async (id) => find(id),

    async createRun({ topic, journal }) {
      const run = createRunModel({
        id: `run-${Date.now()}`,
        topic,
        journal: journal ?? journalProfiles[0]?.name ?? 'AIAA Journal',
      });
      state = pipelineReducer(state, { type: 'createRun', run });
      return run;
    },

    async advance(id) {
      // No stage engine behind fixtures, and no invented evidence number.
      return { run: find(id), evidenceSeq: null, blocked: null };
    },

    async approveGate(id, _gateId, _actor) {
      const run = find(id);
      const stage = run.stages.find((candidate) => candidate.status === 'gate_pending');
      if (stage) state = approveGateAction(state, id, stage.id);
      return find(id);
    },

    async requestRevision(id, _gateId, _actor, _note) {
      const run = find(id);
      const stage = run.stages.find((candidate) => candidate.status === 'gate_pending');
      if (stage) {
        state = pipelineReducer(state, { type: 'requestRevision', runId: id, stageId: stage.id });
      }
      return find(id);
    },

    evidence: async (): Promise<EvidenceRecord[]> => [],
    capabilities: async (): Promise<Capabilities | null> => null,
    audit: async (): Promise<AuditResponse | null> => null,
  };
}
