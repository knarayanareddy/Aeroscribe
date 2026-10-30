import type { GciStudy, MeshSample } from './types';

/** Safety factor for a three-grid GCI (Roache, 1994; ASME V&V 20). */
export const GCI_SAFETY_FACTOR = 1.25;

/** Apparent order is searched in this window; outside it the study is not asymptotic. */
const MIN_ORDER = 0.5;
const MAX_ORDER = 10;

/**
 * Acceptance band for Roache's asymptotic check
 * `GCI_medium / (r^p · GCI_fine)`. When both grids are in the asymptotic range
 * this ratio is 1; the ASME guides suggest a 10% band. A wider 15% band is used
 * here because only three grids are available to estimate the order, and a
 * study outside the band has no defensible uncertainty at all.
 */
const ASYMPTOTIC_RANGE = { min: 0.85, max: 1.15 };

/**
 * Grid Convergence Index from three mesh levels, following Roache's procedure
 * as described in the ASME V&V 20 and AIAA verification guides:
 *
 * 1. sort by cell count, fine → coarse;
 * 2. refinement ratios `r21 = (N2/N1)^(1/3)` and `r32 = (N3/N2)^(1/3)`
 *    (cube root because the meshes are three-dimensional);
 * 3. solve `p = (|ln|(f3-f2)/(f2-f1)|| + q(p)) / ln(r21)` with the fixed-point
 *    correction `q(p) = ln((r21^p - s)/(r32^p - s))`, `s = sign((f3-f2)/(f2-f1))`;
 * 4. extrapolate `f_exact = f1 + (f1-f2)/(r21^p - 1)`;
 * 5. `GCI_fine = 1.25·|(f2-f1)/f1| / (r21^p - 1) · 100` (percent).
 *
 * When the values oscillate under refinement, or the fixed point leaves the
 * admissible order window, the study is reported **invalid with a reason**
 * instead of quoting a confidence interval that is not justified.
 */
export function computeGci(samples: readonly MeshSample[]): GciStudy {
  if (samples.length !== 3) {
    return invalidStudy(samples, 'exactly three mesh levels are required');
  }

  const sorted = [...samples].sort((a, b) => b.cells - a.cells);
  const [fine, medium, coarse] = sorted as [MeshSample, MeshSample, MeshSample];

  if (!(fine.cells > 0 && medium.cells > 0 && coarse.cells > 0)) {
    return invalidStudy(sorted, 'cell counts must be positive');
  }
  if (fine.cells === medium.cells || medium.cells === coarse.cells) {
    return invalidStudy(sorted, 'mesh levels must have distinct cell counts');
  }
  if (![fine.value, medium.value, coarse.value].every(Number.isFinite)) {
    return invalidStudy(sorted, 'all quantities must be finite numbers');
  }

  const f1 = fine.value;
  const f2 = medium.value;
  const f3 = coarse.value;

  if (f1 === f2 && f2 === f3) {
    return {
      levels: sorted,
      apparentOrder: 1,
      orderEstimated: false,
      oscillatoryConvergence: false,
      extrapolatedValue: f1,
      fineGciPercent: 0,
      mediumGciPercent: 0,
      asymptoticRatio: 1,
      valid: false,
      reason: 'identical values on all meshes: the quantity does not depend on the grid',
    };
  }

  if (f2 === f1) {
    return invalidStudy(sorted, 'fine and medium grids produced identical values');
  }

  // Refinement ratios are > 1 by definition: h_coarse / h_fine = (N_fine/N_coarse)^(1/3).
  const r21 = (fine.cells / medium.cells) ** (1 / 3);
  const r32 = (medium.cells / coarse.cells) ** (1 / 3);
  const delta32 = f3 - f2;
  const delta21 = f2 - f1;
  // s = +1 when successive differences share a sign (monotone convergence);
  // s = -1 when they alternate, which is oscillatory convergence.
  const sign = Math.sign(delta32 / delta21);
  const oscillatory = sign < 0;

  const base = Math.abs(Math.log(Math.abs(delta32 / delta21))) / Math.log(r21);

  let p = Number.isFinite(base) && base > 0 ? base : 1;
  let converged = false;

  if (!oscillatory && Number.isFinite(base)) {
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const numerator = r21 ** p - sign;
      const denominator = r32 ** p - sign;
      if (numerator <= 0 || denominator <= 0) break;

      const correction = Math.log(numerator / denominator);
      const next = (Math.abs(Math.log(Math.abs(delta32 / delta21))) + correction) / Math.log(r21);

      if (!Number.isFinite(next)) break;
      const clamped = Math.min(MAX_ORDER, Math.max(MIN_ORDER, next));

      if (Math.abs(clamped - p) < 1e-6) {
        p = clamped;
        converged = true;
        break;
      }
      p = clamped;
    }
  }

  if (!converged) p = 1;

  const rp = r21 ** p;
  const extrapolated = f1 + (f1 - f2) / (rp - 1);
  const fineGci =
    rp === 1
      ? Number.POSITIVE_INFINITY
      : ((GCI_SAFETY_FACTOR * Math.abs((f2 - f1) / f1)) / (rp - 1)) * 100;
  const mediumGci =
    r32 ** p === 1
      ? Number.POSITIVE_INFINITY
      : ((GCI_SAFETY_FACTOR * Math.abs((f3 - f2) / f2)) / (r32 ** p - 1)) * 100;

  const asymptoticRatio =
    rp * fineGci === 0 || !Number.isFinite(rp * fineGci) ? Number.NaN : mediumGci / (rp * fineGci);

  const asymptotic =
    asymptoticRatio >= ASYMPTOTIC_RANGE.min && asymptoticRatio <= ASYMPTOTIC_RANGE.max;

  const valid =
    converged &&
    !oscillatory &&
    asymptotic &&
    Number.isFinite(extrapolated) &&
    Number.isFinite(fineGci) &&
    fineGci >= 0 &&
    fineGci < 100;

  return {
    levels: sorted,
    apparentOrder: p,
    orderEstimated: converged && !oscillatory,
    oscillatoryConvergence: oscillatory,
    extrapolatedValue: extrapolated,
    fineGciPercent: fineGci,
    mediumGciPercent: mediumGci,
    asymptoticRatio,
    valid,
    reason: valid
      ? undefined
      : oscillatory
        ? 'values oscillate with mesh refinement, so no monotonic order can be estimated'
        : !converged
          ? 'the apparent order did not settle inside [0.5, 10]; the grids are not in the asymptotic range'
          : `the grids are not in the asymptotic range (GCI ratio ${asymptoticRatio.toFixed(3)}, expected 1.000 ± 0.150)`,
  };
}

/** Report a value ± GCI uncertainty in the unit the caller uses. */
export function gciUncertainty(study: GciStudy, referenceValue: number): number {
  if (!study.valid || !Number.isFinite(study.fineGciPercent)) return Number.NaN;
  return Math.abs((study.fineGciPercent / 100) * referenceValue);
}

function invalidStudy(samples: readonly MeshSample[], reason: string): GciStudy {
  const sorted = [...samples].sort((a, b) => b.cells - a.cells);
  return {
    levels: sorted,
    apparentOrder: 1,
    orderEstimated: false,
    oscillatoryConvergence: false,
    extrapolatedValue: sorted[0]?.value ?? Number.NaN,
    fineGciPercent: Number.NaN,
    mediumGciPercent: Number.NaN,
    asymptoticRatio: Number.NaN,
    valid: false,
    reason,
  };
}
