import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { UpstreamError } from '../errors';
import { hashBytes } from '../store';

/**
 * Compile `manuscript.tex` with the configured engine.
 *
 * Two passes, because a document with `\bibliography` and `\ref` needs the
 * first pass to write its `.aux` before the second can resolve anything. The
 * engine runs with `-halt-on-error`, so a failure is a failure instead of a PDF
 * full of `??`.
 *
 * Everything the caller learns about a failure comes from the engine's own log
 * tail: a LaTeX error is only actionable if it is quoted.
 */

export interface CompileOptions {
  binary: string;
  /** Directory holding `manuscript.tex`; the PDF lands here. */
  workDir: string;
  timeoutMs?: number;
  /** Passes to run. Two is the minimum for a bibliography. */
  passes?: number;
}

export interface CompileResult {
  pdfPath: string;
  sha256: string;
  bytes: number;
  /** Combined stdout/stderr of the last pass, for the record's log field. */
  log: string;
  durationMs: number;
  passes: number;
}

/** The last `limit` characters of an engine log, for an error message. */
export function logTail(log: string, limit = 2_000): string {
  const trimmed = log.trim();
  return trimmed.length <= limit ? trimmed : `…${trimmed.slice(-limit)}`;
}

interface PassResult {
  code: number | null;
  output: string;
}

function runPass(binary: string, workDir: string, timeoutMs: number): Promise<PassResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let output = '';
    let settled = false;
    const child = spawn(binary, ['-interaction=nonstopmode', '-halt-on-error', 'manuscript.tex'], {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new UpstreamError(
          'LaTeX',
          `the engine exceeded its ${Math.round(Date.now() - started + timeoutMs)}ms wall-clock limit`,
          { binary, timeoutMs },
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new UpstreamError('LaTeX', `could not run "${binary}": ${error.message}`, { binary }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, output });
    });
  });
}

export async function compileLatex({
  binary,
  workDir,
  timeoutMs = 120_000,
  passes = 2,
}: CompileOptions): Promise<CompileResult> {
  const started = Date.now();
  let log = '';

  for (let pass = 1; pass <= passes; pass += 1) {
    const result = await runPass(binary, workDir, timeoutMs);
    log = result.output;
    if (result.code !== 0) {
      throw new UpstreamError(
        'LaTeX',
        `the engine exited with code ${result.code ?? 'null'} on pass ${pass}; the document was not typeset. Engine log: ${logTail(result.output)}`,
        { binary, pass },
      );
    }
  }

  const pdfPath = join(workDir, 'manuscript.pdf');
  let bytes: number;
  try {
    bytes = (await stat(pdfPath)).size;
  } catch {
    throw new UpstreamError(
      'LaTeX',
      `the engine exited successfully but wrote no manuscript.pdf. Engine log: ${logTail(log)}`,
      { binary },
    );
  }

  const buffer = await readFile(pdfPath);
  // A file named `manuscript.pdf` is not a PDF: an engine wrapper, a crashing
  // helper or a stub binary can create an empty or text file and exit 0. The
  // five magic bytes are the cheapest proof that the route can serve a document
  // a reviewer's viewer will open.
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new UpstreamError(
      'LaTeX',
      `the engine wrote a manuscript.pdf that does not begin with "%PDF-" (${buffer.length} bytes). Engine log: ${logTail(log)}`,
      { binary },
    );
  }

  return {
    pdfPath,
    sha256: hashBytes(buffer),
    bytes,
    log: logTail(log, 4_000),
    durationMs: Date.now() - started,
    passes,
  };
}
