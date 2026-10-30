// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CfdService,
  computeGci,
  gciUncertainty,
  runSyntheticStudy,
  SYNTHETIC_DISCLAIMER,
  SYNTHETIC_TRUE_ORDER,
} from '../src/cfd';
import { CapabilityUnavailableError } from '../src/errors';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-cfd-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const unavailable = { configured: false, binary: null, available: false };

describe('synthetic study', () => {
  it('converges at the documented order on three meshes', () => {
    const result = runSyntheticStudy({ quantity: 'drag coefficient' });

    expect(result.solver).toBe('synthetic');
    expect(result.study).not.toBeNull();
    expect(result.study!.valid).toBe(true);
    expect(result.study!.levels).toHaveLength(3);
    expect(result.study!.apparentOrder).toBeCloseTo(SYNTHETIC_TRUE_ORDER, 2);
    expect(result.study!.fineGciPercent).toBeGreaterThan(0);
    expect(result.study!.fineGciPercent).toBeLessThan(1);
    expect(result.study!.asymptoticRatio).toBeCloseTo(1, 1);
  });

  it('is deterministic for the same case and labelled as synthetic', () => {
    const first = runSyntheticStudy({
      quantity: 'drag coefficient',
      caseDescription: 'NACA 0012, M 0.7',
    });
    const second = runSyntheticStudy({
      quantity: 'drag coefficient',
      caseDescription: 'NACA 0012, M 0.7',
    });
    const other = runSyntheticStudy({
      quantity: 'drag coefficient',
      caseDescription: 'RAE 2822, M 0.73',
    });

    expect(second.value).toBe(first.value);
    expect(other.value).not.toBe(first.value);
    expect(first.disclaimer).toBe(SYNTHETIC_DISCLAIMER);
    expect(first.method).toContain('synthetic');
    expect(first.notes.join(' ')).toMatch(/no Navier–Stokes equations were solved/i);
  });

  it('quotes the extrapolated value as the reported number and a GCI-based uncertainty', () => {
    const result = runSyntheticStudy({ quantity: 'lift coefficient' });
    expect(result.value).toBe(result.study!.extrapolatedValue);
    expect(result.uncertainty).toBeCloseTo(gciUncertainty(result.study!, result.value), 12);
    expect(result.uncertainty).toBeGreaterThan(0);
  });

  it('records artefacts with content hashes and no timestamps that would drift', () => {
    const first = runSyntheticStudy({ quantity: 'drag coefficient' });
    const second = runSyntheticStudy({ quantity: 'drag coefficient' });

    expect(first.artefacts.map((artefact) => artefact.name)).toEqual([
      'mesh-levels.json',
      'gci-study.json',
    ]);
    expect(first.artefacts[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(second.artefacts).toEqual(first.artefacts);
  });
});

describe('GCI machinery', () => {
  it('does not claim a small uncertainty from badly refined meshes', () => {
    const study = computeGci([
      { level: 'fine', cells: 100_000, value: 0.5 },
      { level: 'medium', cells: 50_000, value: 0.55 },
      { level: 'coarse', cells: 10_000, value: 0.7 },
    ]);

    // Unequal ratios make the order estimate poor (p ≈ 0.66): the study may be
    // accepted, but the interval it reports must be large, not ±1%.
    expect(study.fineGciPercent).toBeGreaterThan(20);
  });

  it('flags oscillatory convergence instead of trusting it', () => {
    const study = computeGci([
      { level: 'fine', cells: 64_000, value: 0.5 },
      { level: 'medium', cells: 8_000, value: 0.52 },
      { level: 'coarse', cells: 1_000, value: 0.505 },
    ]);

    expect(study.oscillatoryConvergence).toBe(true);
    expect(study.valid).toBe(false);
  });

  it('rejects a study that is far from the asymptotic range', () => {
    // The order changes with the mesh, so the GCI of the two grids disagree:
    // a converged p is not enough, the asymptotic check must also pass.
    const study = computeGci([
      { level: 'fine', cells: 8_000_000, value: 0.02 + 0.5 / 8_000_000 ** (1 / 3) },
      { level: 'medium', cells: 1_000_000, value: 0.02 + 0.5 / 1_000_000 ** (2 / 3) },
      { level: 'coarse', cells: 125_000, value: 0.02 + 0.5 / 125_000 ** 1 },
    ]);

    expect(study.valid).toBe(false);
    expect(study.asymptoticRatio).toBeLessThan(0.85);
    expect(study.reason).toMatch(/asymptotic range/i);
  });
});

describe('CfdService', () => {
  it('runs the synthetic solver by default and labels it', async () => {
    const service = new CfdService({ su2: unavailable, workDir: directory });
    const result = await service.run({ quantity: 'drag coefficient' });

    expect(result.solver).toBe('synthetic');
    expect(result.disclaimer).toBe(SYNTHETIC_DISCLAIMER);
  });

  it('refuses to pretend SU2 is available', async () => {
    const service = new CfdService({ su2: unavailable, workDir: directory });

    await expect(
      service.run({ quantity: 'drag coefficient' }, { solver: 'su2' }),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);

    const error = await service
      .run({ quantity: 'drag coefficient' }, { solver: 'su2' })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 503, code: 'capability_unavailable' });
    expect((error as Error).message).toMatch(/SU2_CFD_BINARY/);
  });

  it('ignores a stale binary path that is not executable', async () => {
    const service = new CfdService({
      su2: { configured: true, binary: join(directory, 'not-here'), available: false },
      workDir: directory,
    });
    await expect(
      service.run({ quantity: 'drag coefficient' }, { solver: 'su2' }),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);
  });

  it('requires three distinct meshes for a real run', async () => {
    const service = new CfdService({
      su2: { configured: true, binary: '/usr/local/bin/SU2_CFD', available: true },
      workDir: directory,
    });

    await expect(
      service.run({ quantity: 'drag coefficient' }, { solver: 'su2' }),
    ).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      service.run(
        {
          quantity: 'drag coefficient',
          meshes: [
            { level: 'fine', cells: 4_000_000, path: 'fine.cfg' },
            { level: 'medium', cells: 4_000_000, path: 'medium.cfg' },
            { level: 'coarse', cells: 500_000, path: 'coarse.cfg' },
          ],
        },
        { solver: 'su2' },
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('infers a solver from the presence of meshes without silently downgrading', async () => {
    const service = new CfdService({ su2: unavailable, workDir: directory });

    // Meshes mean "real run", and no binary means an honest failure.
    await expect(
      service.run({
        quantity: 'drag coefficient',
        meshes: [{ level: 'fine', cells: 1000, path: 'fine.cfg' }],
      }),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);
  });
});
