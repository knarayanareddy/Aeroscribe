import { CapabilityUnavailableError } from '../errors';
import type { Su2Capability } from '../config';
import { runSyntheticStudy } from './synthetic';
import { configsFromRequest, runSu2Study } from './su2';
import type { CfdStudyRequest, CfdStudyResult, SolverKind } from './types';

export * from './types';
export { computeGci, gciUncertainty, GCI_SAFETY_FACTOR } from './gci';
export { runSyntheticStudy, SYNTHETIC_DISCLAIMER, SYNTHETIC_TRUE_ORDER } from './synthetic';
export { parseSu2History, runSu2Once, runSu2Study } from './su2';

export interface CfdServiceOptions {
  su2: Su2Capability;
  workDir: string;
  /** Default solver when a request does not name one. */
  preferredSolver?: SolverKind;
  timeoutPerRunMs?: number;
}

/**
 * Chooses a solver and refuses to be ambiguous about it.
 *
 * If a request asks for `su2` but no usable binary is configured, this throws a
 * 503 naming the missing capability. It never quietly substitutes the synthetic
 * solver for a real one — that silent fallback is exactly how a prototype ends
 * up publishing invented physics under a serious-looking method string.
 */
export class CfdService {
  private readonly options: CfdServiceOptions;

  constructor(options: CfdServiceOptions) {
    this.options = options;
  }

  get su2(): Su2Capability {
    return this.options.su2;
  }

  async run(
    request: CfdStudyRequest,
    options: { solver?: SolverKind } = {},
  ): Promise<CfdStudyResult> {
    const solver: SolverKind =
      options.solver ?? (request.meshes ? 'su2' : (this.options.preferredSolver ?? 'synthetic'));

    if (solver === 'su2') {
      if (!this.options.su2.available || !this.options.su2.binary) {
        throw new CapabilityUnavailableError(
          'SU2',
          'no usable solver binary is configured; set SU2_CFD_BINARY to an executable SU2_CFD, or request solver "synthetic" and label the result as such',
          { binary: this.options.su2.binary, configured: this.options.su2.configured },
        );
      }

      const configs = configsFromRequest(request);
      if (!configs) {
        throw new CapabilityUnavailableError(
          'SU2',
          'a real solver run needs exactly three meshes with distinct cell counts (fine, medium, coarse)',
        );
      }

      return runSu2Study({
        binary: this.options.su2.binary,
        workDir: this.options.workDir,
        configs,
        column: request.quantity,
        quantity: request.quantity,
        timeoutPerRunMs: this.options.timeoutPerRunMs,
      });
    }

    return runSyntheticStudy(request);
  }
}
