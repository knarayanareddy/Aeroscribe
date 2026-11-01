// @vitest-environment node
import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { describeCapabilities } from '../src/config';
import { CfdService } from '../src/cfd';
import { computeGci } from '../src/cfd/gci';
import { createApp } from '../src/http/app';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import { FilesystemAuditStore } from '../src/store';
import { FilesystemEvidenceStore } from '../src/store';
import { FilesystemRunStore } from '../src/store';

/**
 * The SU2 path, driven entirely over HTTP.
 *
 * The only fake here is the solver binary: it writes the `history.csv` a real
 * SU2 run writes, with values that converge at second order. Everything between
 * the request and the evidence record — option parsing, orchestration, the
 * adapter, `history.csv` parsing, the GCI study — is the production code.
 */

let directory: string;
let binary: string;
let config: Config;

const CELLS = { fine: 8_000_000, medium: 1_000_000, coarse: 125_000 };
/** CD = 0.02 + 0.5/N^(2/3): second-order convergence with respect to cell count. */
const value = (cells: number) => 0.02 + 0.5 / cells ** (2 / 3);

async function fakeSolver(path: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const values = ${JSON.stringify({
    'fine.cfg': value(CELLS.fine),
    'medium.cfg': value(CELLS.medium),
    'coarse.cfg': value(CELLS.coarse),
  })};
const config = path.basename(process.argv[2] || '');
const cd = values[config];
if (cd === undefined) {
  process.stderr.write('unknown config: ' + config + '\\n');
  process.exit(2);
}
fs.writeFileSync(
  'history.csv',
  '"Inner_Iter","CD","CL"\\n"0","1.0","0.2"\\n"1","' + cd + '","0.4"\\n',
);
process.exit(0);
`;
  await writeFile(path, script, 'utf8');
  await chmod(path, 0o755);
}

function buildServer() {
  const literature = new LiteratureService({ offline: true, providers: [] });
  const cfd = new CfdService({
    su2: { configured: true, binary, available: true },
    workDir: join(directory, 'cfd'),
  });
  const orchestrator = new Orchestrator({
    runs: new FilesystemRunStore(join(directory, 'runs')),
    registry: new FilesystemEvidenceStore(join(directory, 'registry.ndjson')),
    audit: new FilesystemAuditStore(join(directory, 'audit.ndjson')),
    literature,
    cfd,
    newRunId: () => 'run-su2',
  });

  config = {
    host: '127.0.0.1',
    port: 0,
    dataDir: directory,
    apiKey: '',
    contactEmail: '',
    offline: true,
    su2Binary: binary,
    corsOrigins: ['http://localhost:5174'],
    upstreamTimeoutMs: 5_000,
    retryBaseDelayMs: 1,
    latexBinary: null,
    latexTimeoutMs: 5_000,
    store: 'filesystem',
    databaseUrl: null,
    coordination: 'process',
    redisUrl: null,
    logLevel: 'silent',
    version: 'test',
    commit: 'test',
  };

  return createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
  });
}

type App = ReturnType<typeof buildServer>;

function post(app: App, path: string, body?: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function advanceToStage(app: App, stageId: number): Promise<Response> {
  let last: Response | null = null;

  for (let current = 0; current <= stageId; current += 1) {
    last = await post(app, '/api/v1/runs/run-su2/advance', { actor: 'ana' });
    const body = (await last.clone().json()) as {
      stage?: { id: number; gateId?: string; status: string };
    };
    if (current < stageId && body.stage?.gateId) {
      await post(app, `/api/v1/runs/run-su2/gates/${body.stage.gateId}/approve`, { actor: 'rev' });
    }
  }

  return last!;
}

const MESHES = [
  { level: 'fine', cells: CELLS.fine, path: 'fine.cfg' },
  { level: 'medium', cells: CELLS.medium, path: 'medium.cfg' },
  { level: 'coarse', cells: CELLS.coarse, path: 'coarse.cfg' },
];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-su2-http-'));
  binary = join(directory, 'SU2_CFD');
  await fakeSolver(binary);
  await writeFile(join(directory, 'fine.cfg'), 'MESH= fine\n', 'utf8');
  await writeFile(join(directory, 'medium.cfg'), 'MESH= medium\n', 'utf8');
  await writeFile(join(directory, 'coarse.cfg'), 'MESH= coarse\n', 'utf8');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('mesh configuration over HTTP', () => {
  it('accepts a three-level mesh study when the run is created', async () => {
    const app = buildServer();
    const response = await post(app, '/api/v1/runs', {
      topic: 'transonic wing drag prediction',
      options: { solver: 'su2', quantity: 'CD', meshes: MESHES },
    });

    expect(response.status).toBe(201);
  });

  it('rejects a mesh list that cannot produce a convergence study', async () => {
    const app = buildServer();

    const cases: Array<{ meshes: unknown; message: RegExp }> = [
      { meshes: 'fine', message: /must be an array/ },
      { meshes: [MESHES[0]], message: /exactly three levels/ },
      { meshes: [MESHES[0], MESHES[1], MESHES[2], MESHES[0]], message: /exactly three levels/ },
      { meshes: [{ level: 'fine', cells: 0, path: 'a.cfg' }], message: /exactly three levels/ },
      {
        meshes: [
          { level: 'fine', cells: 10, path: 'a.cfg' },
          { level: 'fine', cells: 20, path: 'b.cfg' },
          { level: 'fine', cells: 30, path: 'c.cfg' },
        ],
        message: /distinct level names/,
      },
      {
        meshes: [
          { level: 'fine', cells: 30, path: 'a.cfg' },
          { level: 'medium', cells: 30, path: 'b.cfg' },
          { level: 'coarse', cells: 30, path: 'c.cfg' },
        ],
        message: /distinct cell counts/,
      },
    ];

    for (const { meshes, message } of cases) {
      const response = await post(app, '/api/v1/runs', {
        topic: 'transonic wing drag prediction',
        options: { solver: 'su2', meshes },
      });
      expect(response.status, JSON.stringify(meshes)).toBe(400);
      expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(
        message,
      );
    }
  });
});

describe('a real solver run over HTTP', () => {
  it('runs three solver invocations and records a valid GCI study', async () => {
    const app = buildServer();
    await post(app, '/api/v1/runs', {
      topic: 'transonic wing drag prediction',
      options: { solver: 'su2', quantity: 'CD', meshes: MESHES, paperLimit: 2, verifyTop: 0 },
    });

    const advanced = await advanceToStage(app, 4);
    const body = (await advanced.json()) as {
      stage: { id: number; status: string; gateId: string };
      evidenceSeq: number;
      blocked: { reason: string } | null;
    };

    expect(advanced.status).toBe(200);
    expect(body.stage.id).toBe(4);
    expect(body.stage.status).toBe('gate_pending');
    expect(body.blocked).toBeNull();

    const evidence = await app.request(`/api/v1/runs/run-su2/evidence?kind=cfd-run`);
    const { records } = (await evidence.json()) as {
      records: Array<{
        payload: {
          solver: string;
          quantity: string;
          value: number;
          uncertainty: number;
          disclaimer?: string;
          gci: {
            levels: Array<{ level: string; cells: number }>;
            valid: boolean;
            apparentOrder: number;
          } | null;
          artefacts: Array<{ name: string; sha256: string }>;
        };
      }>;
    };

    expect(records).toHaveLength(1);
    const payload = records[0]!.payload;

    // The record says SU2, and carries no synthetic disclaimer.
    expect(payload.solver).toBe('su2');
    expect(payload.quantity).toBe('CD');
    expect(payload.disclaimer).toBeUndefined();

    // Three meshes were actually run, and the study is asymptotic.
    expect(payload.gci?.levels.map((level) => level.level)).toEqual(['fine', 'medium', 'coarse']);
    expect(payload.gci?.levels.map((level) => level.cells)).toEqual([
      CELLS.fine,
      CELLS.medium,
      CELLS.coarse,
    ]);
    expect(payload.gci?.valid).toBe(true);
    expect(payload.gci?.apparentOrder).toBeCloseTo(2, 2);
    expect(payload.value).toBeCloseTo(0.02, 4);

    // Every run left a checksummed history file.
    expect(payload.artefacts.map((artefact) => artefact.name)).toEqual([
      'history-fine.csv',
      'history-medium.csv',
      'history-coarse.csv',
    ]);
    for (const artefact of payload.artefacts) expect(artefact.sha256).toMatch(/^[0-9a-f]{64}$/);

    // The GCI value is reproducible from the three cell counts alone.
    const recomputed = computeGci(
      payload.gci!.levels.map((level) => ({
        level: level.level,
        cells: level.cells,
        value: value(level.cells),
      })),
    );
    expect(recomputed.valid).toBe(true);
    expect(recomputed.apparentOrder).toBeCloseTo(2, 2);
  });

  it('isolates each study in its own directory and keeps the artefacts', async () => {
    const app = buildServer();
    await post(app, '/api/v1/runs', {
      topic: 'transonic wing drag prediction',
      options: { solver: 'su2', quantity: 'CD', meshes: MESHES, paperLimit: 2, verifyTop: 0 },
    });
    await advanceToStage(app, 4);

    // One directory per study, so two concurrent runs cannot read each other's
    // history.csv. The last run's file survives as the evidence the checksum
    // refers to.
    const studies = await readdir(join(directory, 'cfd'));
    expect(studies).toHaveLength(1);
    expect(studies[0]).toMatch(/^study-/);
  });

  it('fails honestly when the solver exits non-zero', async () => {
    await writeFile(binary, '#!/usr/bin/env node\nprocess.exit(3);\n', 'utf8');
    await chmod(binary, 0o755);

    const app = buildServer();
    await post(app, '/api/v1/runs', {
      topic: 'transonic wing drag prediction',
      options: { solver: 'su2', quantity: 'CD', meshes: MESHES, paperLimit: 2, verifyTop: 0 },
    });

    const advanced = await advanceToStage(app, 4);
    expect(advanced.status).toBe(502);
    const body = (await advanced.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('upstream_error');
    expect(body.error.message).toMatch(/solver exited with code 3/i);

    const run = await app.request('/api/v1/runs/run-su2');
    const { run: state } = (await run.json()) as {
      run: { status: string; stages: Array<{ id: number; status: string }> };
    };
    expect(state.stages[4]!.status).toBe('failed');
    expect(state.status).toBe('failed');
  });
});
