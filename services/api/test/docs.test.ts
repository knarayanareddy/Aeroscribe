// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/BACKEND.md` is the map an operator reaches for during an incident, so a
 * wrong row in it is a real defect. These tests compare the document to the
 * code that defines the truth: the router and the config loader.
 */

const root = process.cwd();

async function readRepoFile(path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

interface Route {
  method: 'GET' | 'POST';
  path: string;
}

/** Routes registered with `app.get(...)` / `app.post(...)` in the app factory. */
function routesFromSource(source: string): Route[] {
  return Array.from(source.matchAll(/app\.(get|post)\(\s*'([^']+)'/g), (match) => ({
    method: match[1]!.toUpperCase() as Route['method'],
    path: match[2]!,
  }));
}

/** Rows of the endpoint table in the HTTP API section of the backend map. */
function routesFromDocs(source: string): Route[] {
  const section = source.slice(source.indexOf('## 8. HTTP API'), source.indexOf('## 9.'));
  return Array.from(section.matchAll(/^\|\s*(GET|POST)\s*\|\s*`([^`]+)`/gm), (match) => ({
    method: match[1] as Route['method'],
    // The table documents query parameters in the same cell; the router does not.
    path: match[2]!.split('?')[0]!,
  }));
}

/** `process.env.KEY` / `env.KEY` identifiers referenced by config.ts. */
function envKeysFromConfig(source: string): string[] {
  // `envString(` may wrap before its first argument, so whitespace after the
  // opening parenthesis is part of the pattern — without it a key read across
  // two lines (AEROSCRIBE_CORS_ORIGINS) silently escaped this test.
  const keys = Array.from(
    source.matchAll(/env(?:String|Int|Bool)?\(\s*env,\s*'([A-Z0-9_]+)'/g),
    (m) => m[1]!,
  );
  const direct = Array.from(source.matchAll(/env\.([A-Z0-9_]{3,})/g), (m) => m[1]!);
  return Array.from(new Set([...keys, ...direct]));
}

describe('docs/BACKEND.md matches the router', () => {
  it('documents every route the server registers', async () => {
    const [app, docs] = await Promise.all([
      readRepoFile('services/api/src/http/app.ts'),
      readRepoFile('docs/BACKEND.md'),
    ]);

    const documented = new Set(
      routesFromDocs(docs).map((route) => `${route.method} ${route.path}`),
    );
    const registered = routesFromSource(app);

    expect(registered.length).toBeGreaterThan(10);
    for (const route of registered) {
      expect(documented.has(`${route.method} ${route.path}`), `${route.method} ${route.path}`).toBe(
        true,
      );
    }
  });

  it('documents no route the server does not have', async () => {
    const [app, docs] = await Promise.all([
      readRepoFile('services/api/src/http/app.ts'),
      readRepoFile('docs/BACKEND.md'),
    ]);

    const registered = new Set(
      routesFromSource(app).map((route) => `${route.method} ${route.path}`),
    );
    for (const route of routesFromDocs(docs)) {
      expect(registered.has(`${route.method} ${route.path}`), `${route.method} ${route.path}`).toBe(
        true,
      );
    }
  });
});

describe('docs/BACKEND.md matches the configuration loader', () => {
  it('documents every environment variable the config reads', async () => {
    const [config, docs] = await Promise.all([
      readRepoFile('services/api/src/config.ts'),
      readRepoFile('docs/BACKEND.md'),
    ]);

    const keys = envKeysFromConfig(config);
    expect(keys).toContain('AEROSCRIBE_API_KEY');
    expect(keys).toContain('SU2_CFD_BINARY');

    for (const key of keys) {
      expect(docs, `${key} is not documented in docs/BACKEND.md`).toContain(key);
    }
  });

  it('lists every variable in services/api/.env.example', async () => {
    const [config, example] = await Promise.all([
      readRepoFile('services/api/src/config.ts'),
      readRepoFile('services/api/.env.example'),
    ]);

    // An operator copies the example file; a variable missing from it is a
    // setting nobody discovers until a run behaves unexpectedly.
    for (const key of envKeysFromConfig(config)) {
      expect(example, `${key} is missing from services/api/.env.example`).toContain(`${key}=`);
    }
    expect(example).toContain('SEMANTIC_SCHOLAR_API_KEY=');
    expect(example).toContain('AEROSCRIBE_API_KEY=');

    // And it must not promise a variable the code never reads.
    const documented = Array.from(example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm), (m) => m[1]!);
    const known = new Set([...envKeysFromConfig(config), 'SEMANTIC_SCHOLAR_API_KEY']);
    for (const key of documented) {
      expect(known.has(key), `${key} is in .env.example but nothing reads it`).toBe(true);
    }
  });

  it('documents the server-only Semantic Scholar key that index.ts reads', async () => {
    const [index, docs] = await Promise.all([
      readRepoFile('services/api/src/index.ts'),
      readRepoFile('docs/BACKEND.md'),
    ]);

    expect(index).toContain('SEMANTIC_SCHOLAR_API_KEY');
    expect(docs).toContain('SEMANTIC_SCHOLAR_API_KEY');
  });
});

describe('docs/BACKEND.md matches the stage catalogue', () => {
  it('lists each stage name once, in pipeline order', async () => {
    const [stages, docs] = await Promise.all([
      readRepoFile('packages/pipeline/src/stages.ts'),
      readRepoFile('docs/BACKEND.md'),
    ]);

    const names = Array.from(stages.matchAll(/name: '([^']+)'/g), (match) => match[1]!);
    expect(names).toHaveLength(9);

    // Look only at the stage table, so a heading elsewhere cannot satisfy the check.
    const table = docs.slice(docs.indexOf('## 3. Stage-by-stage map'), docs.indexOf('## 4.'));
    const positions = names.map((name) => table.indexOf(`| ${name}`));
    expect(positions.every((position) => position !== -1)).toBe(true);
    // The stage table in the map must be in pipeline order.
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('specs/architecture.md matches the repository', () => {
  const workspaceDirs = ['apps', 'packages', 'services'];

  function layoutBlock(doc: string): string {
    const start = doc.indexOf('## Repository layout');
    const end = doc.indexOf('## Runtime data flow');
    expect(start, 'specs/architecture.md has no "## Repository layout" section').toBeGreaterThan(
      -1,
    );
    expect(end, 'the layout section must be followed by "## Runtime data flow"').toBeGreaterThan(
      start,
    );
    return doc.slice(start, end);
  }

  it('lists every workspace that exists on disk', async () => {
    const { readdir } = await import('node:fs/promises');
    const doc = await readRepoFile('specs/architecture.md');
    const layout = layoutBlock(doc);

    for (const group of workspaceDirs) {
      const entries = await readdir(resolve(root, group), { withFileTypes: true });
      const packages = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      expect(packages.length).toBeGreaterThan(0);
      for (const name of packages) {
        expect(layout, `${group}/${name} is missing from the architecture tree`).toContain(
          `${name}/`,
        );
      }
    }
  });

  it('invents no workspace, package or service that is not on disk', async () => {
    const { stat } = await import('node:fs/promises');
    const doc = await readRepoFile('specs/architecture.md');
    const layout = layoutBlock(doc);

    // Only the two tree prefixes that mark a top-level entry are checked; deeper
    // entries are covered by the workspace test above.
    const topLevel = Array.from(layout.matchAll(/^├── ([A-Za-z0-9_.-]+)\//gm), (m) => m[1]!);
    expect(topLevel).toContain('services');

    for (const name of topLevel) {
      const info = await stat(resolve(root, name)).catch(() => null);
      expect(info?.isDirectory(), `the layout lists ${name}/, which does not exist`).toBe(true);
    }
  });

  it('still states the two limits that are true today', async () => {
    const doc = await readRepoFile('specs/architecture.md');

    // The dashboard is not wired to the API.
    expect(doc).toMatch(/dashboard[^.]*static prototype|fixtures/i);
    expect(doc).toMatch(/wiring the dashboard/i);
    // A run without SU2_CFD_BINARY is synthetic, and stage 8 will not pass it.
    expect(doc).toContain('SU2_CFD_BINARY');
    expect(doc).toMatch(/synthetic/i);
    expect(doc).toMatch(/cannot pass the stage-8 gate|cannot pass/i);

    // And it must not claim the opposite of what the repository now contains.
    expect(doc).not.toContain('No server, database, authentication');
    expect(doc).not.toContain('has not been built');
  });
});
