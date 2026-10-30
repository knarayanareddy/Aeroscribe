// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeGci, gciUncertainty } from '../src/cfd/gci';
import type { MeshSample } from '../src/cfd/types';

/** f(h) = 5 + 3h² sampled on three grids with refinement ratio 2. */
function secondOrderSamples(): MeshSample[] {
  const cells = [1_000_000, 125_000, 15_625]; // r = 2 in 3D
  return cells.map((count, index) => {
    const h = (1 / count) ** (1 / 3);
    return { level: ['fine', 'medium', 'coarse'][index]!, cells: count, value: 5 + 3 * h ** 2 };
  });
}

describe('computeGci', () => {
  it('recovers the observed order and extrapolates to the analytic limit', () => {
    const study = computeGci(secondOrderSamples());

    expect(study.valid).toBe(true);
    expect(study.apparentOrder).toBeCloseTo(2, 3);
    expect(study.extrapolatedValue).toBeCloseTo(5, 6);
    expect(study.fineGciPercent).toBeGreaterThan(0);
    expect(study.fineGciPercent).toBeLessThan(1);
    expect(study.asymptoticRatio).toBeCloseTo(1, 1);
  });

  it('sorts the levels by cell count regardless of input order', () => {
    const shuffled = [...secondOrderSamples()].reverse();
    const study = computeGci(shuffled);
    expect(study.levels.map((level) => level.cells)).toEqual([1_000_000, 125_000, 15_625]);
    expect(study.extrapolatedValue).toBeCloseTo(5, 6);
  });

  it('rejects a study with the wrong number of meshes', () => {
    const study = computeGci(secondOrderSamples().slice(0, 2));
    expect(study.valid).toBe(false);
    expect(study.reason).toMatch(/three mesh levels/);
  });

  it('rejects duplicate cell counts', () => {
    const samples = secondOrderSamples();
    samples[1] = { ...samples[1]!, cells: samples[0]!.cells };
    expect(computeGci(samples).reason).toMatch(/distinct/);
  });

  it('flags oscillatory convergence instead of inventing an order', () => {
    const samples: MeshSample[] = [
      { level: 'fine', cells: 8_000_000, value: 0.31 },
      { level: 'medium', cells: 1_000_000, value: 0.32 },
      { level: 'coarse', cells: 125_000, value: 0.305 },
    ];
    const study = computeGci(samples);
    expect(study.valid).toBe(false);
    expect(study.oscillatoryConvergence).toBe(true);
    expect(study.reason).toMatch(/oscillate/);
  });

  it('reports identical values as a non-answer', () => {
    const samples: MeshSample[] = [
      { level: 'fine', cells: 8_000_000, value: 0.3 },
      { level: 'medium', cells: 1_000_000, value: 0.3 },
      { level: 'coarse', cells: 125_000, value: 0.3 },
    ];
    const study = computeGci(samples);
    expect(study.valid).toBe(false);
    expect(study.reason).toMatch(/identical/);
  });

  it('rejects non-finite values', () => {
    const samples = secondOrderSamples();
    samples[2] = { ...samples[2]!, value: Number.NaN };
    expect(computeGci(samples).reason).toMatch(/finite/);
  });

  it('converts the GCI percentage into an uncertainty in the caller unit', () => {
    const study = computeGci(secondOrderSamples());
    const uncertainty = gciUncertainty(study, study.extrapolatedValue);
    expect(uncertainty).toBeCloseTo((study.fineGciPercent / 100) * study.extrapolatedValue, 10);
    expect(gciUncertainty(computeGci([]), 1)).toBeNaN();
  });
});
