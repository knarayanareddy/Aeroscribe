import type { PipelineRun, StageInfo } from './types';

/**
 * The nine stages of the AeroScribe pipeline.
 *
 * Every surface in the product (dashboard, docs, landing page copy) derives its
 * stage names and counts from this list so the numbers can never drift apart.
 */
export interface StageDefinition {
  id: number;
  name: string;
  shortName: string;
  /** Agents that own this stage once the backend exists. */
  agents: string[];
  /**
   * The gate a run stops at. This is the gate the reducer opens and the only
   * one the API can approve, so it must be `gateIds[0]`.
   */
  gateId: string;
  /**
   * Every gate checkpoint this stage contains according to the specification.
   *
   * Stage 4 has three checkpoints (4A mesh convergence, 4B experimental
   * validation, 4C final figure set); every other stage has one. The prototype
   * models a single open gate per stage, so only `gateId` is enforced at
   * runtime. Keeping the full list here means the "9 stages" and "11
   * checkpoints" figures shown in the UI are both computed, never typed.
   */
  gateIds: readonly string[];
}

/** Stage 4's checkpoints, named so the split is not a bare array of strings. */
export const CFD_GATE_CHECKPOINTS = ['GATE-4A', 'GATE-4B', 'GATE-4C'] as const;

export const PIPELINE_STAGES: readonly StageDefinition[] = [
  {
    id: 0,
    name: 'Topic Intelligence',
    shortName: 'Topic',
    agents: ['TopicIntelligenceAgent'],
    gateId: 'GATE-0',
    gateIds: ['GATE-0'],
  },
  {
    id: 1,
    name: 'Literature Archaeology',
    shortName: 'Literature',
    agents: ['LiteratureHarvestAgent', 'CitationGraphAgent', 'LiteratureRerankerAgent'],
    gateId: 'GATE-1',
    gateIds: ['GATE-1'],
  },
  {
    id: 2,
    name: 'Novelty Detection',
    shortName: 'Novelty',
    agents: ['NoveltyDetectionAgent'],
    gateId: 'GATE-2',
    gateIds: ['GATE-2'],
  },
  {
    id: 3,
    name: 'Contribution Framing',
    shortName: 'Framing',
    agents: ['ContributionFramingAgent'],
    gateId: 'GATE-3',
    gateIds: ['GATE-3'],
  },
  {
    id: 4,
    name: 'Evidence Generation (CFD)',
    shortName: 'CFD',
    agents: ['CFDSetupAgent', 'CFDSolverAgent'],
    gateId: 'GATE-4A',
    gateIds: CFD_GATE_CHECKPOINTS,
  },
  {
    id: 5,
    name: 'Paper Synthesis',
    shortName: 'Writing',
    agents: ['SectionWriterAgent', 'ManuscriptAssemblerAgent'],
    gateId: 'GATE-5',
    gateIds: ['GATE-5'],
  },
  {
    id: 6,
    name: 'Peer Review Council',
    shortName: 'Review',
    agents: ['ReviewerAAgent', 'ReviewerBAgent', 'ReviewerCAgent', 'ReviewerDAgent'],
    gateId: 'GATE-6',
    gateIds: ['GATE-6'],
  },
  {
    id: 7,
    name: 'Revision & Compliance',
    shortName: 'Revision',
    agents: ['RevisionAgent', 'JournalComplianceAgent'],
    gateId: 'GATE-7',
    gateIds: ['GATE-7'],
  },
  {
    id: 8,
    name: 'AeroWiki & Submission',
    shortName: 'Submit',
    agents: ['WikiCompilerAgent', 'SubmissionPackagerAgent'],
    gateId: 'GATE-8',
    gateIds: ['GATE-8'],
  },
] as const;

/**
 * Number of stages in a full pipeline run.
 *
 * Do not use this as a gate or checkpoint count: stage 4 carries three
 * checkpoints, so the two numbers legitimately differ. Use
 * `GATE_CHECKPOINT_COUNT` for anything that talks about gates.
 */
export const STAGE_COUNT = PIPELINE_STAGES.length;

/**
 * Every gate checkpoint across the pipeline, in stage order.
 *
 * Eleven entries for nine stages because stage 4 contributes three. Anything
 * that displays a checkpoint count must read `GATE_CHECKPOINT_COUNT` rather
 * than `STAGE_COUNT`; the tests in `stages.test.ts` pin both numbers.
 */
export const GATE_CHECKPOINTS: readonly string[] = PIPELINE_STAGES.flatMap(
  (stage) => stage.gateIds,
);

/** Number of gate checkpoints in the specification (eleven for nine stages). */
export const GATE_CHECKPOINT_COUNT = GATE_CHECKPOINTS.length;

/**
 * Build the stage list for a new run: the first stage is running, everything
 * else is pending. Returns fresh objects on every call so callers can never
 * mutate a shared template.
 */
export function createStages(): StageInfo[] {
  return PIPELINE_STAGES.map((definition) => ({
    id: definition.id,
    name: definition.name,
    shortName: definition.shortName,
    status: definition.id === 0 ? ('running' as const) : ('pending' as const),
    agentsActive: definition.id === 0 ? [...definition.agents] : [],
    gateId: definition.gateId,
    metrics: {},
  }));
}

export interface CreateRunInput {
  id: string;
  topic: string;
  journal: string;
  now?: Date;
}

/** Create a fully-formed pipeline run in its initial state. */
export function createRun({ id, topic, journal, now = new Date() }: CreateRunInput): PipelineRun {
  const timestamp = now.toISOString();
  return {
    id,
    topic: topic.trim(),
    journal,
    status: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    currentStage: 0,
    noveltyScore: 0,
    paperTitle: 'Pending…',
    stages: createStages(),
  };
}
