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
  /** Human-in-the-loop gate that closes the stage. */
  gateId: string;
  /**
   * Every gate checkpoint this stage contains. Stage 4 has three separate
   * checkpoints (4A/4B/4C) in the specification; all other stages have one.
   */
  gateIds: string[];
}

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
    gateIds: ['GATE-4A', 'GATE-4B', 'GATE-4C'],
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

/** Number of stages in a full pipeline run. */
export const STAGE_COUNT = PIPELINE_STAGES.length;

/**
 * Every gate checkpoint in the specification, in order. Stage 4 contributes
 * three (GATE-4A/4B/4C), so there are eleven checkpoints across nine stages.
 * The prototype models one *field* per stage, so `StageInfo.gateId` holds the
 * first checkpoint of its stage.
 */
export const GATE_CHECKPOINTS: readonly string[] = PIPELINE_STAGES.flatMap(
  (stage) => stage.gateIds,
);

/** Number of human gate checkpoints (11), not of stages (9). */
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
