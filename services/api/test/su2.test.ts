// @vitest-environment node
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CapabilityUnavailableError, UpstreamError } from '../src/errors';
import { computeGci } from '../src/cfd/gci';
import { parseSu2History, runSu2Once, runSu2Study } from '../src/cfd/su2';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-su2-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const HISTORY = `"Inner_Iter","CL","CD","CMz","rms[Rho]"
"0","0.50","0.0300","-0.10","1e-2"
"1","0.51","0.0240","-0.11","3e-3"
"2","0.52","0.0180","-0.12","4e-4"
`;

describe('parseSu2History', () => {
  it('reads the last value of a named column', () => {
    expect(parseSu2History(HISTORY, 'CD')).toBeCloseTo(0.018);
    expect(parseSu2History(HISTORY, 'rms[Rho]')).toBeCloseTo(4e-4);
  });

  it('returns null for an unknown column or empty history', () => {
    expect(parseSu2History(HISTORY, 'CL_total')).toBeNull();
    expect(parseSu2History('', 'CD')).toBeNull();
  });
});

/** A fake solver: writes a history.csv whose CD column encodes the mesh. */
async function fakeSolver(binaryPath: string, valueByConfig: Record<string, number>) {
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const config = path.basename(process.argv[2] || '');
const values = ${JSON.stringify(valueByConfig)};
const value = values[config] ?? 0.5;
fs.writeFileSync('history.csv', '"Inner_Iter","CD","CL"\\n"0","0.9","0.1"\\n"1","' + value + '","0.2"\\n');
process.exit(0);
`;
  await writeFile(binaryPath, script, 'utf8');
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

describe('runSu2Once', () => {
  it('refuses to run a missing binary with a capability error', async () => {
    await expect(
      runSu2Once({ binary: join(directory, 'missing-su2'), configPath: 'cfg', workDir: directory }),
    ).rejects.toBeInstanceOf(CapabilityUnavailableError);
  });

  it('runs the binary and captures its output', async () => {
    const binary = await fakeSolver(join(directory, 'fake-su2'), { 'fine.cfg': 0.018 });

    const output = await runSu2Once({
      binary,
      configPath: 'fine.cfg',
      workDir: directory,
      timeoutMs: 10_000,
    });

    expect(output.exitCode).toBe(0);
    expect(output.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('surfaces a non-zero exit code to the caller', async () => {
    const binary = join(directory, 'failing-su2');
    await writeFile(binary, '#!/usr/bin/env node\nprocess.exit(3);\n', 'utf8');
    await chmod(binary, 0o755);

    const output = await runSu2Once({ binary, configPath: 'x.cfg', workDir: directory });
    expect(output.exitCode).toBe(3);
  });
});

describe('runSu2Study', () => {
  it('builds a GCI study from three real solver invocations', async () => {
    // Second-order convergence in cell count: CD = 0.02 + 0.5/N^(2/3).
    const values = {
      'fine.cfg': 0.02 + 0.5 / 8_000_000 ** (2 / 3),
      'medium.cfg': 0.02 + 0.5 / 1_000_000 ** (2 / 3),
      'coarse.cfg': 0.02 + 0.5 / 125_000 ** (2 / 3),
    };
    const binary = await fakeSolver(join(directory, 'fake-su2'), values);

    const result = await runSu2Study({
      binary,
      workDir: directory,
      configs: [
        { level: 'fine', cells: 8_000_000, configPath: 'fine.cfg' },
        { level: 'medium', cells: 1_000_000, configPath: 'medium.cfg' },
        { level: 'coarse', cells: 125_000, configPath: 'coarse.cfg' },
      ],
      column: 'CD',
      quantity: 'drag coefficient',
    });

    expect(result.solver).toBe('su2');
    expect(result.study?.valid).toBe(true);
    expect(result.study?.apparentOrder).toBeCloseTo(2, 2);
    expect(result.value).toBeCloseTo(0.02, 4);
    expect(result.artefacts.map((artefact) => artefact.name)).toEqual([
      'history-fine.csv',
      'history-medium.csv',
      'history-coarse.csv',
    ]);
    expect(result.artefacts[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aborts when the solver produces no history file', async () => {
    const binary = join(directory, 'no-history-su2');
    await writeFile(binary, '#!/usr/bin/env node\nprocess.exit(0);\n', 'utf8');
    await chmod(binary, 0o755);

    await expect(
      runSu2Study({
        binary,
        workDir: directory,
        configs: [{ level: 'fine', cells: 1000, configPath: 'a.cfg' }],
        column: 'CD',
        quantity: 'drag coefficient',
      }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it('rejects a partially converged set rather than quoting it', async () => {
    const binary = await fakeSolver(join(directory, 'const-su2'), {
      'a.cfg': 0.02,
      'b.cfg': 0.02,
      'c.cfg': 0.02,
    });

    const result = await runSu2Study({
      binary,
      workDir: directory,
      configs: [
        { level: 'fine', cells: 3_000_000, configPath: 'a.cfg' },
        { level: 'medium', cells: 500_000, configPath: 'b.cfg' },
        { level: 'coarse', cells: 60_000, configPath: 'c.cfg' },
      ],
      column: 'CD',
      quantity: 'drag coefficient',
    });

    expect(result.study?.valid).toBe(false);
    expect(result.notes[0]).toMatch(/rejected/i);
  });
});

describe('computeGci integration with solver output', () => {
  it('agrees with the analytic order of the fake solver', () => {
    const study = computeGci([
      { level: 'fine', cells: 8_000_000, value: 0.02 + 0.5 / 8_000_000 ** (2 / 3) },
      { level: 'medium', cells: 1_000_000, value: 0.02 + 0.5 / 1_000_000 ** (2 / 3) },
      { level: 'coarse', cells: 125_000, value: 0.02 + 0.5 / 125_000 ** (2 / 3) },
    ]);
    expect(study.apparentOrder).toBeCloseTo(2, 2);
    expect(study.valid).toBe(true);
  });
});
