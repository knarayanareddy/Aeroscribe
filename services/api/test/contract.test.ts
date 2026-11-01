// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CfdService } from '../src/cfd';
import type { Config } from '../src/config';
import { describeCapabilities } from '../src/config';
import { createApp } from '../src/http/app';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import { createStores } from '../src/store';

/**
 * The contract test.
 *
 * `packages/contract` says what the dashboard is allowed to expect. This test
 * makes that statement checkable: it drives a real run through the HTTP surface
 * the dashboard uses and compares the *shape* of every response with the shape
 * recorded in `apps/dashboard/src/api/__fixtures__/shapes.json`.
 *
 * Why shapes rather than snapshots of values: ids, timestamps and hashes change
 * on every run, and a snapshot of them would fail for reasons that are not
 * drift. A shape changes only when a field is added, removed or retyped — which
 * is exactly when a client needs to be updated.
 *
 * To re-record after an intentional change: `RECORD_FIXTURES=1 npx vitest run
 * services/api/test/contract.test.ts`, then review the diff in
 * `apps/dashboard/src/api/__fixtures__/` and update the mappers that consume it.
 */

const fixtures = resolve(process.cwd(), 'apps/dashboard/src/api/__fixtures__');

/** Two resolvable records, enough to exercise ranking, references and citations. */
const STUB_PROVIDER = {
  name: 'crossref' as const,
  requiresNetwork: false,
  async search() {
    return [
      {
        id: 'crossref:10.2514/1.j060001',
        source: 'crossref' as const,
        title: 'Transonic drag prediction on unstructured meshes',
        authors: ['A. Author', 'B. Author'],
        year: 2024,
        doi: '10.2514/1.j060001',
        url: 'https://doi.org/10.2514/1.j060001',
        abstract: 'A transonic wing drag study on unstructured meshes.',
        citationCount: 12,
        containerTitle: 'AIAA Journal',
        volume: '62',
        pages: '1201-1215',
        publisher: 'AIAA',
      },
      {
        id: 'crossref:10.1016/j.jcp.2023.112001',
        source: 'crossref' as const,
        title: 'Adjoint-based mesh adaptation for transonic flows',
        authors: ['C. Author'],
        year: 2023,
        doi: '10.1016/j.jcp.2023.112001',
        url: 'https://doi.org/10.1016/j.jcp.2023.112001',
        abstract: 'Mesh adaptation for transonic wing computations.',
        citationCount: 40,
        containerTitle: 'Journal of Computational Physics',
        volume: '491',
        pages: '112001',
        publisher: 'Elsevier',
      },
    ];
  },
  async resolveDoi(doi: string) {
    const found = (await STUB_PROVIDER.search()).find((record) => record.doi === doi);
    return found ?? null;
  },
};
const shapePath = join(fixtures, 'shapes.json');
const recording = process.env.RECORD_FIXTURES === '1';

type Shape =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'undefined'
  | 'empty-array'
  | { array: Shape }
  | { [key: string]: Shape };

/**
 * The shape of a value, ignoring the value itself.
 *
 * Array shape is taken from the first element — a response that sometimes
 * carries objects and sometimes strings would be a contract violation the
 * dashboard cannot handle, and this reports it on the sample it sees.
 */
function shapeOf(value: unknown): Shape {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return value.length === 0 ? 'empty-array' : { array: shapeOf(value[0]) };
  }
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default: {
      const out: Record<string, Shape> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        out[key] = shapeOf((value as Record<string, unknown>)[key]);
      }
      return out;
    }
  }
}

/** Compare a live shape with the recorded one, reporting the exact path. */
function diff(expected: Shape, actual: Shape, path = '$'): string[] {
  if (typeof expected === 'string' || typeof actual === 'string') {
    return expected === actual
      ? []
      : [`${path}: recorded ${show(expected)}, server ${show(actual)}`];
  }
  if ('array' in expected || 'array' in actual) {
    if (!('array' in expected) || !('array' in actual)) {
      return [`${path}: one side is an array, the other is not`];
    }
    return diff(expected.array, actual.array, `${path}[]`);
  }
  const problems: string[] = [];
  for (const key of Object.keys(expected)) {
    if (!(key in actual))
      problems.push(`${path}.${key}: recorded, but the server no longer sends it`);
    else problems.push(...diff(expected[key]!, actual[key]!, `${path}.${key}`));
  }
  for (const key of Object.keys(actual)) {
    if (!(key in expected))
      problems.push(`${path}.${key}: new field the dashboard does not know about`);
  }
  return problems;
}

function show(shape: Shape): string {
  return typeof shape === 'string' ? shape : JSON.stringify(shape);
}

interface Capture {
  name: string;
  body: unknown;
}

let directory: string;
let app: ReturnType<typeof createApp>;
const captures: Capture[] = [];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-contract-'));
  const config: Config = {
    host: '127.0.0.1',
    port: 0,
    dataDir: directory,
    apiKey: '',
    contactEmail: '',
    offline: true,
    su2Binary: null,
    corsOrigins: ['http://localhost:5174'],
    upstreamTimeoutMs: 5_000,
    retryBaseDelayMs: 1,
    latexBinary: null,
    latexTimeoutMs: 5_000,
    store: 'filesystem',
    logLevel: 'silent',
    version: '0.2.0',
    commit: 'contract',
  };

  // The same factory production uses, so the recorded wire shape includes
  // everything a real server sends — including `/health`'s store probe.
  const stores = createStores({ dataDir: directory, store: 'filesystem' });

  const orchestrator = new Orchestrator({
    runs: stores.runs,
    registry: stores.evidence,
    audit: stores.audit,
    // A stubbed Crossref stands in for the network: the capture is a real
    // server run, but its two provider calls are answered locally so the test
    // works offline and produces references with DOIs. Everything downstream —
    // DOI resolution, ranking, the reference records, the manuscript — is the
    // production code path.
    literature: new LiteratureService({ offline: false, providers: [STUB_PROVIDER] }),
    cfd: new CfdService({
      su2: { available: false, binary: null },
      workDir: join(directory, 'cfd'),
    }),
    newRunId: () => 'run-contract',
    defaultOptions: { paperLimit: 4, verifyTop: 2, solver: 'synthetic' },
  });

  app = createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    stores,
  });

  const json = async (path: string, init?: RequestInit) => {
    const response = await app.request(path, init);
    const body: unknown = await response.json();
    expect(response.status, `${init?.method ?? 'GET'} ${path}`).toBeLessThan(400);
    return body;
  };

  const postJson = (path: string, body?: unknown) =>
    json(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  captures.push({ name: 'capabilities', body: await json('/api/v1/capabilities') });

  const created = (await postJson('/api/v1/runs', {
    topic: 'transonic wing drag prediction at Mach 0.85',
  })) as { run: { id: string } };
  const runId = created.run.id;

  captures.push({ name: 'runs', body: await json('/api/v1/runs') });

  // Drive all eight stages, approving the human gate after each one. This is
  // the same sequence the dashboard performs, in the same order.
  for (let index = 0; index < 9; index += 1) {
    const advanced = (await postJson(`/api/v1/runs/${runId}/advance`)) as {
      stage: { gateId?: string };
    };
    captures.push({ name: `advance-${index}`, body: advanced });

    // Stage 8 is blocked (the run is synthetic and the review said revise), so it
    // writes its package record and then fails; there is no gate to approve.
    const gateId = advanced.stage.gateId;
    const blocked = (advanced as { blocked?: unknown }).blocked;
    if (gateId && !blocked) {
      await postJson(`/api/v1/runs/${runId}/gates/${gateId}/approve`, { actor: 'ana' });
    }
  }

  captures.push({ name: 'run', body: await json(`/api/v1/runs/${runId}`) });
  captures.push({ name: 'evidence', body: await json(`/api/v1/runs/${runId}/evidence`) });
  captures.push({ name: 'audit', body: await json('/api/v1/audit') });
  captures.push({ name: 'registry', body: await json('/api/v1/evidence/verify') });
  captures.push({
    name: 'literature-search',
    body: await json('/api/v1/literature/search?q=transonic%20wing%20drag&limit=2'),
  });
  captures.push({
    name: 'claims',
    body: await postJson('/api/v1/claims/verify', {
      text: 'The computed drag coefficient is 0.0.',
      runId,
    }),
  });

  // Re-check last, so the captures above describe the registry as it stood
  // during the run: the re-check appends a record of its own.
  captures.push({
    name: 'references-recheck',
    body: await postJson(`/api/v1/runs/${runId}/references/recheck`),
  });
  captures.push({ name: 'references', body: await json(`/api/v1/runs/${runId}/references`) });
}, 60_000);

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('the dashboard contract matches the server', () => {
  it('records or verifies the shape of every response the dashboard consumes', async () => {
    const shapes = Object.fromEntries(captures.map(({ name, body }) => [name, shapeOf(body)]));

    if (recording) {
      await mkdir(fixtures, { recursive: true });
      await writeFile(shapePath, `${JSON.stringify(shapes, null, 2)}\n`, 'utf8');
      // `advance-N` is checked but not stored: it is the same envelope every
      // time, and the dashboard consumes the run from `GET /runs/:id`. Storing
      // eight near-identical copies would be noise in review.
      for (const { name, body } of captures.filter(
        (capture) => !capture.name.startsWith('advance-'),
      )) {
        await writeFile(
          join(fixtures, `${name}.json`),
          `${JSON.stringify(body, null, 2)}\n`,
          'utf8',
        );
      }
      return;
    }

    const recorded = JSON.parse(await readFile(shapePath, 'utf8')) as Record<string, Shape>;

    const problems: string[] = [];
    for (const { name } of captures) {
      if (!(name in recorded)) problems.push(`${name}: not in the recorded contract`);
      else problems.push(...diff(recorded[name]!, shapes[name]!, name));
    }
    for (const name of Object.keys(recorded)) {
      if (!captures.some((capture) => capture.name === name)) {
        problems.push(`${name}: recorded, but the server no longer produces it`);
      }
    }

    expect(
      problems,
      `Re-record with RECORD_FIXTURES=1 once you have updated the dashboard. Problems:\n${problems.join('\n')}`,
    ).toEqual([]);
  });

  it('serves the recorded fixtures the dashboard mapper tests read', async () => {
    // The committed fixtures are a real capture. If a mapper test starts from a
    // fixture the server cannot produce, the mapper is being tested against
    // fiction — so the fixture must also satisfy the live shape.
    const recorded = JSON.parse(await readFile(shapePath, 'utf8')) as Record<string, Shape>;

    for (const name of Object.keys(recorded).filter((entry) => !entry.startsWith('advance-'))) {
      const body = JSON.parse(await readFile(join(fixtures, `${name}.json`), 'utf8')) as unknown;
      expect(diff(recorded[name]!, shapeOf(body), name), `${name}.json`).toEqual([]);
    }
  });
});
