import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import type { LatexCapability } from '@aeroscribe/contract';

/**
 * Is there a TeX engine on this machine?
 *
 * The same rule as `SU2_CFD_BINARY`: detected, never assumed. `configured` says
 * the operator set `LATEX_BINARY`; `available` says running it produced a
 * version. A path that does not exist, or a file that is not executable, is
 * configured-but-unavailable — a fact the UI can show and the stage-8 blocker
 * can explain.
 */

/** What every run reports when no toolchain was configured. */
export const NO_LATEX: LatexCapability = {
  configured: false,
  binary: null,
  available: false,
  version: null,
};

/** First line of `<binary> --version`, trimmed and bounded. */
export function versionLine(output: string): string | null {
  const line = output
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line === undefined ? null : line.slice(0, 200);
}

function capture(
  binary: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ code, output });
    };

    let child;
    try {
      child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      finish(null);
      return;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code);
    });
  });
}

/**
 * Probe a binary without ever throwing.
 *
 * A twenty-second hang must not hang `/health`, so the probe has its own short
 * deadline and treats a timeout as "not available".
 */
export async function probeLatex(
  binary: string | null,
  options: { timeoutMs?: number } = {},
): Promise<LatexCapability> {
  if (!binary) return NO_LATEX;

  try {
    await access(binary);
  } catch {
    return { configured: true, binary, available: false, version: null };
  }

  const { code, output } = await capture(binary, ['--version'], options.timeoutMs ?? 5_000);
  const version = versionLine(output);
  return {
    configured: true,
    binary,
    // A non-zero exit with a version string still means "usable": some TeX
    // wrappers exit 1 on `--version`. No version at all means unusable.
    available: code !== null && version !== null,
    version,
  };
}
