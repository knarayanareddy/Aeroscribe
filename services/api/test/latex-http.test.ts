// @vitest-environment node
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capabilities, LatexCapability } from '@aeroscribe/contract';
import { STAGE_COUNT } from '@aeroscribe/pipeline';
import { CfdService } from '../src/cfd';
import type { Config } from '../src/config';
import { describeCapabilities } from '../src/config';
import { createApp } from '../src/http/app';
import { LatexService } from '../src/latex';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import { AuditLog } from '../src/store/audit';
import { EvidenceRegistry } from '../src/store/registry';
import { RunRepository } from '../src/store/runs';

/**
 * The typeset manuscript, driven over HTTP.
 *
 * The only fake is the engine: a node script that writes the PDF `pdflatex`
 * writes. Rendering, the record, the blocker, the download routes and the hash
 * check are the production path.
 */

let directory: string;
let latex: LatexCapability;
let app: ReturnType<typeof createApp>;
let orchestrator: Orchestrator;
let config: Config;

const PDF = '%PDF-1.4 fake typeset manuscript';

async function fakeEngine(): Promise<string> {
  const path = join(directory, 'pdflatex');
  await writeFile(
    path,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) {
  console.log('pdfTeX 3.141592653-2.6-1.40.25 (TeX Live 2024)');
  process.exit(0);
}
if (!fs.existsSync('manuscript.tex')) {
  console.log('! LaTeX Error: File manuscript.tex not found.');
  process.exit(1);
}
fs.writeFileSync('manuscript.pdf', Buffer.from(${JSON.stringify(PDF)}));
console.log('Output written on manuscript.pdf.');
process.exit(0);
`,
    'utf8',
  );
  await chmod(path, 0o755);
  return path;
}

function build(engine: LatexCapability): ReturnType<typeof createApp> {
  latex = engine;
  const service = new LatexService({
    latex,
    workDir: join(directory, 'manuscripts'),
    passes: 1,
    timeoutMs: 5_000,
  });
  orchestrator = new Orchestrator({
    runs: new RunRepository(join(directory, 'runs')),
    registry: new EvidenceRegistry(join(directory, 'registry.ndjson')),
    audit: new AuditLog(join(directory, 'audit.ndjson')),
    literature: new LiteratureService({ offline: true, providers: [] }),
    cfd: new CfdService({
      su2: { available: false, binary: null },
      workDir: join(directory, 'cfd'),
    }),
    latex: service,
    newRunId: () => 'run-latex',
    defaultOptions: { paperLimit: 2, verifyTop: 0 },
  });

  config = {
    host: '127.0.0.1',
    port: 0,
    dataDir: directory,
    apiKey: '',
    contactEmail: '',
    offline: true,
    su2Binary: null,
    latexBinary: engine.binary,
    latexTimeoutMs: 5_000,
    corsOrigins: ['http://localhost:5174'],
    upstreamTimeoutMs: 5_000,
    retryBaseDelayMs: 1,
    doiMaxAgeDays: 30,
    logLevel: 'silent',
    version: 'test',
    commit: 'test',
  };

  return createApp({
    orchestrator,
    config,
    capabilities: async (): Promise<Capabilities> => ({
      ...(await describeCapabilities(config)),
      latex,
    }),
  });
}

type App = ReturnType<typeof createApp>;

function post(target: App, path: string, body?: unknown) {
  return target.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Run the pipeline to `stageId`, approving every gate on the way. */
async function advanceTo(target: App, stageId: number): Promise<Response> {
  let last: Response | null = null;
  for (let current = 0; current <= stageId; current += 1) {
    last = await post(target, '/api/v1/runs/run-latex/advance', { actor: 'ana' });
    const body = (await last.clone().json()) as {
      stage?: { id: number; gateId?: string };
      blocked?: unknown;
    };
    if (current < stageId && body.stage?.gateId && !body.blocked) {
      await post(target, `/api/v1/runs/run-latex/gates/${body.stage.gateId}/approve`, {
        actor: 'rev',
      });
    }
  }
  return last!;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-latex-http-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('without a TeX engine', () => {
  beforeEach(async () => {
    app = build({ configured: false, binary: null, available: false, version: null });
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    await advanceTo(app, STAGE_COUNT - 1);
  });

  it('records source-only, names the missing capability and still serves the .tex', async () => {
    const records = (await (
      await app.request('/api/v1/runs/run-latex/evidence?kind=manuscript-render')
    ).json()) as {
      records: Array<{
        payload: {
          typeset: string;
          pdf: unknown;
          toolchain: unknown;
          template: string;
          files: Array<{ name: string }>;
        };
      }>;
    };
    expect(records.records).toHaveLength(1);
    expect(records.records[0]!.payload).toMatchObject({
      typeset: 'source-only',
      pdf: null,
      toolchain: null,
      template: 'aiaa-style',
    });

    const packageResponse = (await (
      await app.request('/api/v1/runs/run-latex/evidence?kind=submission-package')
    ).json()) as { records: Array<{ payload: { submission: { blockers: string[] } } }> };
    expect(packageResponse.records[0]!.payload.submission.blockers).toContain(
      'the manuscript PDF was not typeset (LATEX_BINARY is not set)',
    );

    const tex = await app.request('/api/v1/runs/run-latex/manuscript.tex');
    expect(tex.status).toBe(200);
    expect(tex.headers.get('content-type')).toMatch(/text\/x-tex/);
    const body = await tex.text();
    expect(body).toContain('\\documentclass[11pt]{article}');
    expect(tex.headers.get('x-content-sha256')).toMatch(/^[0-9a-f]{64}$/);

    const pdf = await app.request('/api/v1/runs/run-latex/manuscript.pdf');
    expect(pdf.status).toBe(503);
    const error = (await pdf.json()) as { error: { code: string; message: string } };
    expect(error.error.code).toBe('capability_unavailable');
    expect(error.error.message).toMatch(/LaTeX/);
  });

  it('409s for a run that has not reached stage 8, and 404s for an unknown run', async () => {
    // `beforeEach` already advanced this run; a second run has no render yet.
    orchestrator = new Orchestrator({
      runs: new RunRepository(join(directory, 'runs')),
      registry: new EvidenceRegistry(join(directory, 'registry.ndjson')),
      audit: new AuditLog(join(directory, 'audit.ndjson')),
      literature: new LiteratureService({ offline: true, providers: [] }),
      cfd: new CfdService({
        su2: { available: false, binary: null },
        workDir: join(directory, 'cfd'),
      }),
      newRunId: () => 'run-fresh',
    });
    app = createApp({ orchestrator, config, capabilities: () => describeCapabilities(config) });
    await post(app, '/api/v1/runs', { topic: 'a run that has not been rendered' });

    const early = await app.request('/api/v1/runs/run-fresh/manuscript.tex');
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: { message: string } }).error.message).toMatch(
      /no rendered manuscript yet/,
    );

    expect((await app.request('/api/v1/runs/run-nope/manuscript.tex')).status).toBe(404);
  });
});

describe('with a TeX engine', () => {
  it('typesets the PDF, records its hash and serves the same bytes', async () => {
    const binary = await fakeEngine();
    app = build({ configured: true, binary, available: true, version: 'pdfTeX (fake)' });
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    await advanceTo(app, STAGE_COUNT - 1);

    const records = (await (
      await app.request('/api/v1/runs/run-latex/evidence?kind=manuscript-render')
    ).json()) as {
      records: Array<{
        payload: {
          typeset: string;
          pdf: { sha256: string; bytes: number };
          toolchain: { binary: string; version: string | null };
        };
      }>;
    };
    const payload = records.records[0]!.payload;
    expect(payload.typeset).toBe('pdf');
    expect(payload.pdf.bytes).toBe(Buffer.from(PDF).byteLength);
    expect(payload.toolchain).toEqual({ binary, version: 'pdfTeX (fake)' });

    const response = await app.request('/api/v1/runs/run-latex/manuscript.pdf');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('x-content-sha256')).toBe(payload.pdf.sha256);
    expect(await response.text()).toBe(PDF);
  });

  it('refuses to serve a file that no longer matches the record', async () => {
    const binary = await fakeEngine();
    app = build({ configured: true, binary, available: true, version: 'pdfTeX (fake)' });
    await post(app, '/api/v1/runs', { topic: 'transonic wing drag prediction' });
    await advanceTo(app, STAGE_COUNT - 1);

    const path = join(directory, 'manuscripts', 'run-latex', 'manuscript.pdf');
    await writeFile(path, 'tampered after the record was written', 'utf8');

    const response = await app.request('/api/v1/runs/run-latex/manuscript.pdf');
    expect(response.status).toBe(500);
    const error = (await response.json()) as { error: { code: string } };
    expect(error.error.code).toBe('artefact_mismatch');
  });

  it('reports the engine version in capabilities', async () => {
    const binary = await fakeEngine();
    app = build({ configured: true, binary, available: true, version: 'pdfTeX 3.141592653' });
    const capabilities = (await (await app.request('/api/v1/capabilities')).json()) as Capabilities;
    expect(capabilities.latex).toMatchObject({
      configured: true,
      available: true,
      binary,
    });
  });
});
