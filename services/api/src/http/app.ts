import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Capabilities, Config } from '../config';
import { ApiError, badRequest, unauthorized } from '../errors';
import type { Orchestrator } from '../orchestrator';
import type { EvidenceKind } from '../store/registry';
import { buildPolicy, verifyClaims } from '../claims/verify';
import { RateLimiter } from './rateLimit';

export interface AppDependencies {
  orchestrator: Orchestrator;
  config: Config;
  capabilities: () => Promise<Capabilities>;
  /** Exposed so tests can drive the limiter's clock. */
  rateLimiter?: RateLimiter;
  /** Set to false in tests that hammer the API. */
  enableLogging?: boolean;
}

const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'stage-output',
  'literature-search',
  'doi-verification',
  'cfd-run',
  'gci-study',
  'novelty-report',
  'manuscript',
  'review-report',
  'compliance-report',
  'wiki-article',
  'submission-package',
];

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
  enableLogging = false,
}: AppDependencies): Hono {
  const app = new Hono();

  // Hono reports handler errors through `onError`, not by rethrowing through
  // middleware, so error mapping has to live here to keep status codes truthful
  // (a 404 that arrives as a 500 is a bug report waiting to happen).
  app.onError((error, context) => {
    if (error instanceof ApiError) {
      return context.json(
        { error: { code: error.code, message: error.message, details: error.details } },
        error.status as 400,
      );
    }
    // Log the real cause server-side, return a generic message: stack traces in
    // responses leak file paths and dependency versions.
    console.error('[api] unhandled error', error);
    return context.json(
      { error: { code: 'internal_error', message: 'The request failed unexpectedly.' } },
      500,
    );
  });

  if (enableLogging) app.use('*', logger());

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
      throw unauthorized();
    }
    return next();
  });

  app.get('/health', async (context) => {
    const caps = await capabilities();
    return context.json({
      status: 'ok',
      service: '@aeroscribe/api',
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

  return Object.keys(options).length > 0 ? options : undefined;
}

async function readJson<T>(
  request: Request,
  { optional = false }: { optional?: boolean } = {},
): Promise<T> {
  const text = await request.text();
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
