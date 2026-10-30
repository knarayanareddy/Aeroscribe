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
}

export const PIPELINE_STAGES: readonly StageDefinition[] = [
  {
    id: 0,
    name: 'Topic Intelligence',
    shortName: 'Topic',
    agents: ['TopicIntelligenceAgent'],
    gateId: 'GATE-0',
  },
  {
    id: 1,
    name: 'Literature Archaeology',
    shortName: 'Literature',
    agents: ['LiteratureHarvestAgent', 'CitationGraphAgent', 'LiteratureRerankerAgent'],
    gateId: 'GATE-1',
  },
  {
    id: 2,
    name: 'Novelty Detection',
    shortName: 'Novelty',
    agents: ['NoveltyDetectionAgent'],
    gateId: 'GATE-2',
  },
  {
    id: 3,
    name: 'Contribution Framing',
    shortName: 'Framing',
    agents: ['ContributionFramingAgent'],
    gateId: 'GATE-3',
  },
  {
    id: 4,
    name: 'Evidence Generation (CFD)',
    shortName: 'CFD',
    agents: ['CFDSetupAgent', 'CFDSolverAgent'],
    gateId: 'GATE-4A',
  },
  {
    id: 5,
    name: 'Paper Synthesis',
    shortName: 'Writing',
    agents: ['SectionWriterAgent', 'ManuscriptAssemblerAgent'],
    gateId: 'GATE-5',
  },
  {
    id: 6,
    name: 'Peer Review Council',
    shortName: 'Review',
    agents: ['ReviewerAAgent', 'ReviewerBAgent', 'ReviewerCAgent', 'ReviewerDAgent'],
    gateId: 'GATE-6',
  },
  {
    id: 7,
    name: 'Revision & Compliance',
    shortName: 'Revision',
    agents: ['RevisionAgent', 'JournalComplianceAgent'],
    gateId: 'GATE-7',
  },
  {
    id: 8,
    name: 'AeroWiki & Submission',
    shortName: 'Submit',
    agents: ['WikiCompilerAgent', 'SubmissionPackagerAgent'],
    gateId: 'GATE-8',
  },
] as const;

/**
 * Number of stages in a full pipeline run. The specification defines eleven gate
 * checkpoints because stage 4 splits into GATE-4A/4B/4C; the prototype models
 * one gate per stage and shows GATE-4A for stage 4.
 */
export const STAGE_COUNT = PIPELINE_STAGES.length;

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
