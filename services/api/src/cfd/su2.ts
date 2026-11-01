import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { CapabilityUnavailableError, UpstreamError } from '../errors';
import { hashBytes } from '../store';
import { computeGci, gciUncertainty } from './gci';
import type { CfdStudyRequest, CfdStudyResult, MeshSample } from './types';

export interface Su2RunOptions {
  binary: string;
  configPath: string;
  workDir: string;
  timeoutMs?: number;
}

export interface Su2RunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Run SU2 once.
 *
 * This is a thin, honest adapter: it execs the configured binary with the
 * configuration file, enforces a wall-clock limit (killing the process group on
 * timeout) and returns the captured output. It does not pretend to install SU2,
 * generate meshes or know anything about the case beyond the config file you
 * give it.
 */
export async function runSu2Once({
  binary,
  configPath,
  workDir,
  timeoutMs = 10 * 60_000,
}: Su2RunOptions): Promise<Su2RunOutput> {
  try {
    await access(binary);
  } catch {
    throw new CapabilityUnavailableError(
      'SU2',
      `the configured solver binary "${binary}" does not exist or is not executable`,
      { binary },
    );
  }

  const startedAt = Date.now();

  return new Promise<Su2RunOutput>((resolve, reject) => {
    const child = spawn(binary, [configPath], { cwd: workDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGKILL');
      settled = true;
      reject(
        new UpstreamError(
          'SU2',
          `solver exceeded its ${Math.round(timeoutMs / 1000)}s wall-clock limit`,
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new CapabilityUnavailableError('SU2', `could not start the solver: ${error.message}`, {
          binary,
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

/**
 * SU2 writes `history.csv` with a commented header line followed by one row per
 * iteration. This reads the last row and pulls out the requested column, so the
 * quantity of interest comes from the solver rather than from parsed stdout.
 */
export function parseSu2History(csv: string, column: string): number | null {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;

  // SU2 quotes every cell, header included: `"Inner_Iter","CD","CL"`.
  const headerIndex = Math.max(
    0,
    lines.findIndex((line) => /^"?(Inner_Iter|Time_Iter)"/.test(line)),
  );
  const headers = lines[headerIndex]!.split(',').map((header) => header.replace(/"/g, '').trim());
  const index = headers.indexOf(column);
  if (index === -1) return null;

  for (let cursor = lines.length - 1; cursor > headerIndex; cursor -= 1) {
    const cells = lines[cursor]!.split(',').map((cell) => cell.trim().replace(/"/g, ''));
    const raw = cells[index];
    if (raw === undefined || raw === '') continue;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export interface Su2StudyOptions {
  binary: string;
  workDir: string;
  /** Config file per mesh level; the adapter does not write configs for you. */
  configs: Array<{ level: string; cells: number; configPath: string }>;
  /** Column in SU2's history.csv holding the quantity of interest. */
  column: string;
  quantity: string;
  unit?: string;
  timeoutPerRunMs?: number;
}

/**
 * Run SU2 on three meshes and turn the results into a GCI study.
 *
 * Any non-zero exit, missing history file or missing column aborts the study
 * with a message naming the level that failed — a partially converged set must
 * never be presented as a grid study.
 */
export async function runSu2Study(options: Su2StudyOptions): Promise<CfdStudyResult> {
  const samples: MeshSample[] = [];
  const artefacts: Array<{ name: string; sha256: string }> = [];

  // SU2 writes a fixed `history.csv` in its working directory, so two concurrent
  // studies sharing one directory would read each other's results. Each study
  // therefore gets its own directory; the files are kept as an audit trail.
  const studyDir = resolve(options.workDir, `study-${randomUUID()}`);
  await mkdir(studyDir, { recursive: true });

  for (const config of options.configs) {
    const output = await runSu2Once({
      binary: options.binary,
      // Relative config paths are resolved against the configured work dir, not
      // against the per-study directory the solver runs in.
      configPath: resolve(options.workDir, config.configPath),
      workDir: studyDir,
      timeoutMs: options.timeoutPerRunMs,
    });

    if (output.exitCode !== 0) {
      throw new UpstreamError(
        'SU2',
        `solver exited with code ${output.exitCode} on the ${config.level} mesh`,
        { stderr: output.stderr.slice(-2_000) },
      );
    }

    const history = await readFile(join(studyDir, 'history.csv'), 'utf8').catch(() => null);
    if (!history) {
      throw new UpstreamError('SU2', `no history.csv was produced for the ${config.level} mesh`);
    }

    const value = parseSu2History(history, options.column);
    if (value === null) {
      throw new UpstreamError(
        'SU2',
        `history.csv for the ${config.level} mesh has no "${options.column}" column`,
      );
    }

    artefacts.push({
      name: `history-${config.level}.csv`,
      sha256: hashBytes(Buffer.from(history)),
    });
    samples.push({
      level: config.level,
      cells: config.cells,
      value,
      wallTimeS: Math.round(output.durationMs / 1000),
    });
  }

  const study = computeGci(samples);
  const value = study.valid ? study.extrapolatedValue : samples[0]!.value;

  return {
    quantity: options.quantity,
    unit: options.unit ?? 'dimensionless',
    solver: 'su2',
    study,
    value,
    uncertainty: gciUncertainty(study, value),
    method: `SU2 (${options.binary}), three meshes, Roache GCI on history column "${options.column}"`,
    notes: [
      study.valid
        ? `Observed order ${study.apparentOrder.toPrecision(3)}, fine-grid GCI ${study.fineGciPercent.toPrecision(3)}%.`
        : `GCI study rejected: ${study.reason ?? 'unknown reason'}.`,
    ],
    artefacts,
  };
}

/** Convenience wrapper around `CfdStudyRequest.meshes` for the API layer. */
export function configsFromRequest(
  request: CfdStudyRequest,
): Array<{ level: string; cells: number; configPath: string }> | null {
  if (!request.meshes || request.meshes.length !== 3) return null;
  return request.meshes.map((mesh) => ({
    level: mesh.level,
    cells: mesh.cells,
    configPath: mesh.path,
  }));
}
