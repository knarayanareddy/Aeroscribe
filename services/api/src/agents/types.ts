import type { PipelineRun, StageInfo } from '@aeroscribe/pipeline';
import type { CfdService } from '../cfd';
import type { LatexService } from '../latex';
import type { LiteratureService } from '../literature';
import type { BlobStore } from '../blob';
import type { EvidenceKind, EvidenceStore } from '../store';

export interface StageContext {
  run: PipelineRun;
  stage: StageInfo;
  literature: LiteratureService;
  cfd: CfdService;
  /** Renders the manuscript; typesets only when a TeX engine answered the probe. */
  latex: LatexService;
  registry: EvidenceStore;
  /**
   * Where artefact bytes are stored, so the digest in a record can be checked
   * against something a reader can fetch.
   */
  blobs: BlobStore;
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

/** A second record a stage appends after its primary one. */
export interface ExtraRecord {
  kind: EvidenceKind;
  label: string;
  payload: unknown;
}

export interface StageOutcome {
  kind: EvidenceKind;
  label: string;
  summary: string;
  payload: unknown;
  /** Metrics shown on the run card; scalars only. */
  metrics: Record<string, string | number>;
  /**
   * Records that describe an artefact rather than a stage transition.
   *
   * Stage 8 uses this for the rendered manuscript: it is produced *by* the
   * stage but is not the submission package, and giving it its own record means
   * a reader can fetch the `.tex` without parsing the package.
   */
  extra?: readonly ExtraRecord[];
  /** Optional signal that the stage produced a blocking problem. */
  blocked?: { reason: string };
}

export type StageHandler = (context: StageContext) => Promise<StageOutcome>;
