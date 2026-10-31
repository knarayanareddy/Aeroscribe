/** One mesh level and the quantity of interest it produced. */
export interface MeshSample {
  level: string;
  cells: number;
  value: number;
  /** Solver-reported iteration count, when available. */
  iterations?: number;
  /** Wall-clock seconds spent on this level. */
  wallTimeS?: number;
}

export interface GciStudy {
  levels: MeshSample[];
  /** Observed order of accuracy, or the fallback when it cannot be estimated. */
  apparentOrder: number;
  orderEstimated: boolean;
  oscillatoryConvergence: boolean;
  /** Richardson-extrapolated value of the quantity of interest. */
  extrapolatedValue: number;
  /** Grid Convergence Index of the fine grid, in percent. */
  fineGciPercent: number;
  /** GCI of the medium grid, in percent. */
  mediumGciPercent: number;
  /** GCI_medium / (r^p · GCI_fine); close to 1 when the study is asymptotic. */
  asymptoticRatio: number;
  valid: boolean;
  /** Why the study is not usable, when `valid` is false. */
  reason?: string;
}

export type SolverKind = 'su2' | 'synthetic';

export interface CfdStudyRequest {
  /** Quantity of interest, e.g. "drag coefficient". */
  quantity: string;
  /** Free-form case description; the synthetic solver uses it for determinism. */
  caseDescription?: string;
  /**
   * Meshes for a real solver run. Required for `solver: 'su2'`.
   *
   * Only geometry metadata lives here: level name, cell count (for the GCI
   * refinement ratios) and the path to a config file that already contains the
   * solver settings. Case parameters are an engineering decision, not something
   * this adapter should guess.
   */
  meshes?: Array<{ level: string; cells: number; path: string }>;
}

export interface CfdStudyResult {
  quantity: string;
  unit: string;
  solver: SolverKind;
  study: GciStudy | null;
  /** Value to quote in a manuscript: the extrapolated one when the study is valid. */
  value: number;
  uncertainty: number;
  method: string;
  notes: string[];
  /** Present whenever the numbers are not the output of a real solver. */
  disclaimer?: string;
  artefacts: Array<{ name: string; sha256: string }>;
}
