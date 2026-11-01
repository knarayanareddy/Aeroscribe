// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { Config } from '../src/config';
import { describeCapabilities } from '../src/config';
import { createFilesystemBlobStore, type BlobStore } from '../src/blob';
import { CfdService } from '../src/cfd';
import { createApp } from '../src/http/app';
import { LiteratureService } from '../src/literature';
import { Orchestrator } from '../src/orchestrator';
import { FilesystemAuditStore, FilesystemEvidenceStore, FilesystemRunStore } from '../src/store';

/**
 * `GET /api/v1/evidence/:seq/artefacts/:name`, over HTTP.
 *
 * The whole point of the route is that it does not trust the store: it reads the
 * digest out of the evidence record, fetches the bytes, re-hashes them, and
 * refuses to serve a file that no longer matches. So the interesting tests are
 * the two failures — altered bytes (`409`) and a digest whose bytes were never
 * stored (`404`) — not the happy path alone.
 *
 * Stage 4 runs the synthetic solver here, which is the real code path for every
 * deployment without a `SU2_CFD_BINARY`; the bytes it records are the canonical
 * JSON it hashed.
 */

let directory: string;
let blobs: BlobStore;
let registry: FilesystemEvidenceStore;
let orchestrator: Orchestrator;
let app: Hono;
let config: Config;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-artefacts-'));
  config = {
    host: '127.0.0.1',
    port: 0,
    dataDir: directory,
    apiKey: '',
    contactEmail: '',
    offline: true,
    su2Binary: null,
    latexBinary: null,
    latexTimeoutMs: 5_000,
    corsOrigins: [],
    upstreamTimeoutMs: 5_000,
    retryBaseDelayMs: 1,
    doiMaxAgeDays: 30,
    store: 'filesystem',
    databaseUrl: null,
    coordination: 'process',
    redisUrl: null,
    logLevel: 'silent',
    version: 'test',
    commit: 'test',
  };

  blobs = createFilesystemBlobStore({ dataDir: directory });
  registry = new FilesystemEvidenceStore(join(directory, 'registry.ndjson'));
  orchestrator = new Orchestrator({
    runs: new FilesystemRunStore(join(directory, 'runs')),
    registry,
    audit: new FilesystemAuditStore(join(directory, 'audit.ndjson')),
    literature: new LiteratureService({ offline: true, providers: [] }),
    cfd: new CfdService({
      su2: { available: false, binary: null },
      workDir: join(directory, 'cfd'),
    }),
    blobs,
    newRunId: () => 'run-artefacts',
    defaultOptions: { paperLimit: 2, verifyTop: 0, solver: 'synthetic' },
  });
  app = createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    blobs,
  });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Append a record that names an artefact, without running a stage. */
async function recordWithArtefact(
  name: string,
  content: Uint8Array,
  mediaType = 'application/json',
  store = true,
): Promise<number> {
  const ref = store ? await blobs.put(content, mediaType) : { sha256: sha256(content) };
  const record = await registry.append({
    kind: 'cfd-run',
    runId: 'run-artefacts',
    stageId: 4,
    label: 'artefact fixture',
    payload: {
      stage: 'evidence-generation',
      schemaVersion: 1,
      artefacts: [
        { name, sha256: ref.sha256, bytes: content.length, mediaType },
        { name: 'other.json', sha256: sha256(Buffer.from('other')), bytes: 5, mediaType },
      ],
    },
  });
  return record.seq;
}

describe('reading an artefact', () => {
  it('serves exactly the bytes the record hashed, with the digest in a header', async () => {
    const content = Buffer.from('{"levels":["fine","medium","coarse"]}', 'utf8');
    const seq = await recordWithArtefact('mesh-levels.json', content);

    const response = await app.request(`/api/v1/evidence/${seq}/artefacts/mesh-levels.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('x-content-sha256')).toBe(sha256(content));
    expect(response.headers.get('etag')).toBe(`"sha256-${sha256(content)}"`);

    const body = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(body).equals(content)).toBe(true);
  });

  it('answers 409 rather than serving bytes that no longer match the chain', async () => {
    const content = Buffer.from('{"value":0.31}', 'utf8');
    const seq = await recordWithArtefact('gci-study.json', content);

    // Flip one byte in the stored object — the same thing a bad restore or a
    // careless `sed` would do.
    const digest = sha256(content);
    const path = join(directory, 'blobs', 'sha256', digest.slice(0, 2), digest.slice(2));
    const tampered = Buffer.from(content);
    tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 0x01;
    await writeFile(path, tampered);

    const response = await app.request(`/api/v1/evidence/${seq}/artefacts/gci-study.json`);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('artefact_hash_mismatch');
    expect(body.error.details).toEqual({ expected: digest, actual: sha256(tampered) });
    // Not one byte of the altered file is returned.
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('names the artefact it has no bytes for, and says why', async () => {
    const content = Buffer.from('{}', 'utf8');
    const seq = await recordWithArtefact('mesh-levels.json', content, 'application/json', false);

    const response = await app.request(`/api/v1/evidence/${seq}/artefacts/mesh-levels.json`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.message).toContain('bytes are not stored');
    // The record itself is fine; this is a gap in the deployment, not a break
    // in the chain, so verification still passes.
    expect(await registry.verify()).toMatchObject({ valid: true });
  });

  it('lists what the record does have when the name is wrong', async () => {
    const seq = await recordWithArtefact('mesh-levels.json', Buffer.from('{}'));

    const response = await app.request(`/api/v1/evidence/${seq}/artefacts/nope.json`);
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toContain('mesh-levels.json');
  });

  it('answers 404 for a sequence number that does not exist', async () => {
    const response = await app.request('/api/v1/evidence/999/artefacts/anything.json');
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });

  it('rejects a sequence that is not a number', async () => {
    const response = await app.request('/api/v1/evidence/abc/artefacts/x.json');
    expect(response.status).toBe(400);
  });
});

describe('the synthetic CFD stage', () => {
  it('stores what it hashes, so its artefacts can be fetched and re-checked', async () => {
    const run = await orchestrator.createRun({ topic: 'transonic wing drag prediction' });
    for (let stage = 0; stage < 4; stage += 1) {
      await orchestrator.advance(run.id);
      const current = (await orchestrator.getRun(run.id)).stages[stage]!;
      await orchestrator.approveGate(run.id, current.gateId!);
    }
    const advanced = await orchestrator.advance(run.id);

    const record = await registry.get(advanced.evidenceSeq!);
    const payload = record!.payload as {
      solver: string;
      artefacts: Array<{ name: string; sha256: string; bytes: number; mediaType: string }>;
    };
    expect(payload.solver).toBe('synthetic');
    expect(payload.artefacts).toHaveLength(2);

    for (const artefact of payload.artefacts) {
      const response = await app.request(
        `/api/v1/evidence/${advanced.evidenceSeq}/artefacts/${artefact.name}`,
      );
      expect(response.status, artefact.name).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // The digest in the record describes these exact bytes — that is the
      // difference between a checksum and a claim.
      expect(sha256(bytes), artefact.name).toBe(artefact.sha256);
      expect(bytes.length).toBe(artefact.bytes);
    }
  }, 30_000);
});
