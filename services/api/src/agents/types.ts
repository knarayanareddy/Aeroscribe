import type { PipelineRun, StageInfo } from '@aeroscribe/pipeline';
import type { CfdService } from '../cfd';
import type { LiteratureService } from '../literature';
import type { EvidenceRegistry, EvidenceKind } from '../store/registry';

export interface StageContext {
  run: PipelineRun;
  stage: StageInfo;
  literature: LiteratureService;
  cfd: CfdService;
  registry: EvidenceRegistry;
  now: () => Date;
  /** How old a generation-time DOI verification may be before it counts as stale. */
  doiMaxAgeDays: number;
  /** Per-run knobs; defaults are documented in `runOptionsSchema` at the HTTP layer. */
  options: RunOptions;
}

export interface RunOptions {
  /** Maximum papers requested from each provider. */
  paperLimit: number;
  /** How many of the search hits to DOI-verify (each is a network round trip). */
  verifyTop: number;
  /** Solver to use for stage 4; `synthetic` is labelled in every artefact. */
  solver?: 'su2' | 'synthetic';
  /** Quantity of interest for the CFD study. */
  quantity: string;
  caseDescription?: string;
  meshes?: Array<{ level: string; cells: number; path: string }>;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = {
  paperLimit: 10,
  verifyTop: 5,
  quantity: 'drag coefficient',
};

export interface StageOutcome {
  kind: EvidenceKind;
  label: string;
  summary: string;
  payload: unknown;
  /** Metrics shown on the run card; scalars only. */
  metrics: Record<string, string | number>;
  /** Optional signal that the stage produced a blocking problem. */
  blocked?: { reason: string };
}

export type StageHandler = (context: StageContext) => Promise<StageOutcome>;
