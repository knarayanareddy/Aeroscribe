import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Capabilities, Config } from '../config';
import { ApiError, badRequest, payloadTooLarge, unauthorized } from '../errors';
import { silentLogger, type Logger } from '../lib/logger';
import { bindRunId, runIdFromPath, runWithRequestScope, scopeFields } from '../lib/requestContext';
import type { Orchestrator } from '../orchestrator';
import { EVIDENCE_KINDS, type EvidenceKind } from '../store/registry';
import { buildPolicy, verifyClaims } from '../claims/verify';
import { RateLimiter } from './rateLimit';

export interface AppDependencies {
  orchestrator: Orchestrator;
  config: Config;
  capabilities: () => Promise<Capabilities>;
  /** Exposed so tests can drive the limiter's clock. */
  rateLimiter?: RateLimiter;
  /**
   * Structured logger. `buildServer` always supplies one; the silent default
   * exists so a test can build the app without describing how it logs.
   */
  logger?: Logger;
}

// Kinds the pipeline can actually produce, taken from the one list the store
// defines. This used to be a second, hand-maintained copy that advertised
// `doi-verification`, `gci-study` and `wiki-article` — kinds no stage writes, so
// filtering on them returned an empty list forever and looked like "not recorded
// yet" rather than "does not exist". DOI resolutions live in the literature
// record, the GCI study inside the CFD record, the wiki article inside the
// submission package.

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function clientKey(header: string | undefined, forwardedFor: string | undefined): string {
  return bearerToken(header) ?? forwardedFor?.split(',')[0]?.trim() ?? 'anonymous';
}

/**
 * Build the HTTP app.
 *
 * Order matters: JSON error handling wraps everything, the rate limiter runs
 * before authentication so an unauthenticated flood cannot spend CPU on token
 * comparison, and authentication protects `/api/v1/*` while leaving `/health`
 * open for probes.
 */
export function createApp({
  orchestrator,
  config,
  capabilities,
  rateLimiter = new RateLimiter({ limit: 60, windowMs: 60_000 }),
  logger = silentLogger(),
}: AppDependencies): Hono {
  const app = new Hono();

  /**
   * Every request gets an id, echoed as `x-request-id` and bound to the async
   * scope, so a log line written eight frames deep still names its request.
   * A run-scoped path also binds the run id.
   */
  app.use('*', async (context, next) => {
    const inbound = context.req.header('x-request-id')?.trim();
    const requestId = inbound && inbound.length > 0 ? inbound.slice(0, 128) : randomUUID();
    const runId = runIdFromPath(context.req.path);
    const startedAt = Date.now();

    await runWithRequestScope({ requestId, ...(runId ? { runId } : {}) }, async () => {
      // Re-bind inside the scope: a handler that moves between runs (a future
      // cross-run report) would otherwise leak the path's run id.
      if (runId) bindRunId(runId);
      try {
        await next();
      } finally {
        context.header('x-request-id', requestId);
        logger.info('http.request', {
          ...scopeFields(),
          method: context.req.method,
          path: context.req.path,
          status: context.res.status,
          duration_ms: Date.now() - startedAt,
        });
      }
    });
  });

  // Hono reports handler errors through `onError`, not by rethrowing through
  // middleware, so error mapping has to live here to keep status codes truthful
  // (a 404 that arrives as a 500 is a bug report waiting to happen).
  app.onError((error, context) => {
    if (error instanceof ApiError) {
      if (error.status >= 500) {
        logger.error('http.error', {
          ...scopeFields(),
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
      return context.json(
        { error: { code: error.code, message: error.message, details: error.details } },
        error.status as 400,
      );
    }
    // Log the real cause server-side, return a generic message: stack traces in
    // responses leak file paths and dependency versions.
    logger.error('http.error', {
      ...scopeFields(),
      status: 500,
      code: 'internal_error',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      path: context.req.path,
    });
    return context.json(
      { error: { code: 'internal_error', message: 'The request failed unexpectedly.' } },
      500,
    );
  });

  app.use(
    '/api/*',
    cors({
      origin: (origin) => (origin && config.corsOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  app.use('/api/*', async (context, next) => {
    const key = clientKey(
      context.req.header('authorization'),
      context.req.header('x-forwarded-for'),
    );
    const result = rateLimiter.check(key);
    context.header('x-ratelimit-remaining', String(result.remaining));
    if (!result.allowed) {
      logger.warn('http.rate_limited', {
        ...scopeFields(),
        path: context.req.path,
        reset_at: result.resetAt,
      });
      return context.json(
        { error: { code: 'rate_limited', message: 'Too many requests; try again later.' } },
        429,
      );
    }
    return next();
  });

  app.use('/api/*', async (context, next) => {
    if (config.apiKey === '') return next();
    if (bearerToken(context.req.header('authorization')) !== config.apiKey) {
      logger.warn('http.unauthorised', { ...scopeFields(), path: context.req.path });
      throw unauthorized();
    }
    return next();
  });

  app.get('/health', async (context) => {
    const caps = await capabilities();
    return context.json({
      status: 'ok',
      service: '@aeroscribe/api',
      version: config.version,
      commit: config.commit,
      logLevel: config.logLevel,
      capabilities: caps,
      authRequired: caps.auth.required,
    });
  });

  app.get('/api/v1/capabilities', async (context) => context.json(await capabilities()));

  app.get('/api/v1/runs', async (context) => {
    const runs = await orchestrator.listRuns();
    return context.json({ runs });
  });

  app.post('/api/v1/runs', async (context) => {
    const body = await readJson<{
      topic?: unknown;
      journal?: unknown;
      researcher?: unknown;
      options?: unknown;
    }>(context.req.raw);

    if (typeof body.topic !== 'string') throw badRequest('"topic" must be a string.');
    if (body.journal !== undefined && typeof body.journal !== 'string') {
      throw badRequest('"journal" must be a string when provided.');
    }

    const run = await orchestrator.createRun({
      topic: body.topic,
      journal: body.journal,
      researcher: typeof body.researcher === 'string' ? body.researcher : undefined,
      options: sanitiseOptions(body.options),
    });

    return context.json({ run }, 201);
  });

  app.get('/api/v1/runs/:id', async (context) => {
    const run = await orchestrator.getRun(context.req.param('id'));
    return context.json({ run });
  });

  app.post('/api/v1/runs/:id/advance', async (context) => {
    const body = await readJson<{ actor?: unknown }>(context.req.raw, { optional: true });
    const result = await orchestrator.advance(
      context.req.param('id'),
      typeof body.actor === 'string' ? body.actor : 'anonymous',
    );
    return context.json({
      run: result.run,
      stage: result.stage,
      evidenceSeq: result.evidenceSeq,
      blocked: result.blocked ?? null,
    });
  });

  app.post('/api/v1/runs/:id/gates/:gateId/approve', async (context) => {
    const body = await readJson<{ actor?: unknown }>(context.req.raw, { optional: true });
    const run = await orchestrator.approveGate(
      context.req.param('id'),
      context.req.param('gateId'),
      typeof body.actor === 'string' ? body.actor : 'anonymous',
    );
    return context.json({ run });
  });

  app.post('/api/v1/runs/:id/gates/:gateId/reject', async (context) => {
    const body = await readJson<{ actor?: unknown; note?: unknown }>(context.req.raw, {
      optional: true,
    });
    const run = await orchestrator.requestRevision(
      context.req.param('id'),
      context.req.param('gateId'),
      typeof body.actor === 'string' ? body.actor : 'anonymous',
      typeof body.note === 'string' ? body.note : undefined,
    );
    return context.json({ run });
  });

  app.get('/api/v1/runs/:id/evidence', async (context) => {
    const kindParam = context.req.query('kind');
    if (kindParam && !EVIDENCE_KINDS.includes(kindParam as EvidenceKind)) {
      throw badRequest(`Unknown evidence kind "${kindParam}".`, { allowed: EVIDENCE_KINDS });
    }
    const records = await orchestrator.evidence(
      context.req.param('id'),
      kindParam as EvidenceKind | undefined,
    );
    return context.json({ records });
  });

  // ── References ────────────────────────────────────────────────────────────
  //
  // A re-check appends a record; it never edits the manuscript. GET joins the
  // stored references with the newest re-check, and answers `unchecked` when
  // there has never been one rather than implying the citations are current.

  app.post('/api/v1/runs/:id/references/recheck', async (context) => {
    const outcome = await orchestrator.recheckReferences(context.req.param('id'));
    return context.json(
      {
        record: outcome.record,
        summary: outcome.payload.summary,
        checkedAt: outcome.payload.checkedAt,
        offline: outcome.payload.offline,
      },
      201,
    );
  });

  app.get('/api/v1/runs/:id/references', async (context) =>
    context.json(await orchestrator.referenceStatus(context.req.param('id'))),
  );

  // ── Manuscript artefacts ──────────────────────────────────────────────────
  //
  // Both routes serve the file the record hashed, and refuse when the file on
  // disk no longer matches it. A PDF that was never typeset is a 503 naming the
  // missing capability, not a 404: the run exists, the artefact does not.

  app.get('/api/v1/runs/:id/manuscript.tex', async (context) => {
    const artefact = await orchestrator.manuscriptArtefact(context.req.param('id'), 'tex');
    context.header('content-type', 'text/x-tex; charset=utf-8');
    context.header('x-content-sha256', artefact.sha256);
    context.header('content-disposition', 'inline; filename="manuscript.tex"');
    return context.body(artefact.kind === 'tex' ? artefact.content : '');
  });

  app.get('/api/v1/runs/:id/manuscript.pdf', async (context) => {
    const artefact = await orchestrator.manuscriptArtefact(context.req.param('id'), 'pdf');
    context.header('content-type', 'application/pdf');
    context.header('x-content-sha256', artefact.sha256);
    context.header('content-disposition', 'inline; filename="manuscript.pdf"');
    if (artefact.kind !== 'pdf') return context.body('');
    return context.body(new Uint8Array(artefact.bytes).buffer as ArrayBuffer);
  });

  app.get('/api/v1/evidence/verify', async (context) =>
    context.json(await orchestrator.verifyRegistry()),
  );

  // The audit trail is the answer to "who approved this gate": it is readable
  // per run, and never writable over HTTP.
  app.get('/api/v1/audit', async (context) => {
    const runId = context.req.query('runId');
    const limit = Number(context.req.query('limit') ?? '200');
    const { entries, malformed } = await orchestrator.auditTrail({
      ...(runId ? { runId } : {}),
      limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 2000) : 200,
    });
    return context.json({ entries, malformed });
  });

  app.get('/api/v1/literature/search', async (context) => {
    const query = context.req.query('q') ?? '';
    const limit = Number.parseInt(context.req.query('limit') ?? '10', 10);
    if (query.trim().length < 3) throw badRequest('"q" must be at least 3 characters.');
    const report = await orchestrator.searchLiterature(query, Number.isFinite(limit) ? limit : 10);
    return context.json(report);
  });

  app.post('/api/v1/literature/verify-doi', async (context) => {
    const body = await readJson<{ doi?: unknown; expectedTitle?: unknown }>(context.req.raw);
    if (typeof body.doi !== 'string') throw badRequest('"doi" must be a string.');
    const verification = await orchestrator.verifyDoi(
      body.doi,
      typeof body.expectedTitle === 'string' ? body.expectedTitle : undefined,
    );
    return context.json(verification, verification.verified ? 200 : 422);
  });

  app.post('/api/v1/claims/verify', async (context) => {
    const body = await readJson<{ text?: unknown; runId?: unknown }>(context.req.raw);
    if (typeof body.text !== 'string') throw badRequest('"text" must be a string.');

    if (typeof body.runId !== 'string') {
      throw badRequest(
        '"runId" is required: claims are only meaningful against a run\'s evidence.',
      );
    }

    const records = await orchestrator.evidence(body.runId);
    const report = verifyClaims(body.text, buildPolicy(records));
    return context.json(report);
  });

  app.notFound((context) =>
    context.json({ error: { code: 'not_found', message: 'No such route.' } }, 404),
  );

  return app;
}

function sanitiseOptions(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const options: Record<string, unknown> = {};

  if (typeof input.paperLimit === 'number' && input.paperLimit > 0 && input.paperLimit <= 50) {
    options.paperLimit = Math.floor(input.paperLimit);
  }
  if (typeof input.verifyTop === 'number' && input.verifyTop >= 0 && input.verifyTop <= 20) {
    options.verifyTop = Math.floor(input.verifyTop);
  }
  if (input.solver === 'su2' || input.solver === 'synthetic') options.solver = input.solver;
  if (typeof input.quantity === 'string' && input.quantity.trim().length > 0) {
    options.quantity = input.quantity.trim();
  }
  if (typeof input.caseDescription === 'string') options.caseDescription = input.caseDescription;

  // Without this the SU2 path is unreachable over HTTP: the request would keep
  // `solver: "su2"` but lose the meshes, and stage 4 would fail with a 503 that
  // blames a missing solver configuration the caller did send.
  if (input.meshes !== undefined) {
    const meshes = parseMeshes(input.meshes);
    if (meshes) options.meshes = meshes;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

interface MeshOption {
  level: string;
  cells: number;
  path: string;
}

/**
 * Validate a mesh study at the boundary.
 *
 * A run that is guaranteed to fail at stage 4 should be rejected here, with a
 * 400 that names the problem, rather than created and then 503'd twenty minutes
 * into the pipeline. The rules match what the GCI machinery needs: three
 * distinct levels with distinct cell counts.
 */
function parseMeshes(raw: unknown): MeshOption[] | null {
  if (!Array.isArray(raw)) {
    throw badRequest('"meshes" must be an array of { level, cells, path } objects.');
  }
  if (raw.length !== 3) {
    throw badRequest(
      '"meshes" must contain exactly three levels: a grid-convergence study compares fine, medium and coarse.',
      { received: raw.length },
    );
  }

  const meshes = raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw badRequest(`"meshes[${index}]" must be an object.`);
    }
    const mesh = entry as Record<string, unknown>;

    if (typeof mesh.level !== 'string' || mesh.level.trim() === '') {
      throw badRequest(`"meshes[${index}].level" must be a non-empty string.`);
    }
    if (typeof mesh.cells !== 'number' || !Number.isInteger(mesh.cells) || mesh.cells <= 0) {
      throw badRequest(`"meshes[${index}].cells" must be a positive integer.`);
    }
    if (typeof mesh.path !== 'string' || mesh.path.trim() === '') {
      throw badRequest(`"meshes[${index}].path" must be a non-empty string.`);
    }

    return { level: mesh.level.trim(), cells: mesh.cells, path: mesh.path.trim() };
  });

  if (new Set(meshes.map((mesh) => mesh.level)).size !== meshes.length) {
    throw badRequest('"meshes" must use distinct level names.');
  }
  if (new Set(meshes.map((mesh) => mesh.cells)).size !== meshes.length) {
    throw badRequest(
      '"meshes" must use distinct cell counts; identical counts cannot show convergence.',
    );
  }

  return meshes;
}

/** Request bodies are small JSON documents; a megabyte is generous. */
const MAX_BODY_BYTES = 1024 * 1024;

async function readJson<T>(
  request: Request,
  { optional = false }: { optional?: boolean } = {},
): Promise<T> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw payloadTooLarge(`The request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw payloadTooLarge(`The request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }
  if (text.trim() === '') {
    if (optional) return {} as T;
    throw badRequest('A JSON body is required.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw badRequest('The request body is not valid JSON.');
  }
}
