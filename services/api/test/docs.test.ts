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
  const keys = Array.from(
    source.matchAll(/env(?:String|Int|Bool)?\(env,\s*'([A-Z0-9_]+)'/g),
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
