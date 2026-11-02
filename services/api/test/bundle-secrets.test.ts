// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/check-bundle-secrets.mjs` is the build's only guard against a value
 * the server reads reaching a browser. It is a script, not a module, so these
 * drive it as CI does and read what an operator would read.
 *
 * The regression worth pinning down: the rule is "only `VITE_`-prefixed names
 * may reach the browser", and Vite's own built-ins are not `VITE_`-prefixed.
 * A deploy path read via `import.meta.env.BASE_URL` is the supported way to ask
 * "where am I served from?"; failing it taught nothing and blocked the build.
 */

const script = resolve('scripts/check-bundle-secrets.mjs');
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

/** A throwaway repo root: the script resolves client source relative to cwd. */
async function root(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bundle-secrets-'));
  created.push(directory);
  await mkdir(join(directory, 'apps/landing-page/src'), { recursive: true });
  return directory;
}

function check(cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(process.execPath, [script], { cwd }, (error, stdout, stderr) => {
      const code = error ? Number(error.code ?? 1) : 0;
      done({ code, out: `${stdout}${stderr}` });
    });
  });
}

describe('bundle secret check', () => {
  it('allows Vite built-ins, which carry no secret', async () => {
    const directory = await root();
    await writeFile(
      join(directory, 'apps/landing-page/src/site.ts'),
      [
        'export const url = `${import.meta.env.BASE_URL}demo/aeroscribe-demo.mp4`;',
        'export const mode = import.meta.env.MODE;',
        'export const dev = import.meta.env.DEV;',
      ].join('\n'),
    );

    const { code, out } = await check(directory);
    expect(out).toMatch(/nothing to report/);
    expect(code).toBe(0);
  });

  it('fails a secret-shaped name read from client code', async () => {
    const directory = await root();
    await writeFile(
      join(directory, 'apps/landing-page/src/leak.ts'),
      'const key = import.meta.env.AEROSCRIBE_API_KEY;\n',
    );

    const { code, out } = await check(directory);
    expect(code).toBe(1);
    expect(out).toMatch(/AEROSCRIBE_API_KEY/);
    expect(out).toMatch(/non-public environment variable/);
  });

  it('fails a non-VITE_ variable even when the name looks harmless', async () => {
    // The point of the prefix rule is that it does not depend on anyone judging
    // names: "DATABASE_URL" reads fine and is still none of the browser's business.
    const directory = await root();
    await writeFile(
      join(directory, 'apps/landing-page/src/config.ts'),
      'export const db = import.meta.env.DATABASE_URL;\n',
    );

    const { code, out } = await check(directory);
    expect(code).toBe(1);
    expect(out).toMatch(/DATABASE_URL/);
  });

  it('fails `process.env` in browser code', async () => {
    const directory = await root();
    await writeFile(
      join(directory, 'apps/landing-page/src/node.ts'),
      'export const key = process.env.AEROSCRIBE_API_KEY;\n',
    );

    const { code } = await check(directory);
    expect(code).toBe(1);
  });
});
