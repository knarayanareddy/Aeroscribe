import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authSettings, type Capabilities, type Config } from '../config';
import { auditActor, type Principal } from '../auth/principal';
import { authorize, seesEveryRun, type Action } from '../auth/policy';
import { createAuthenticator, type Authenticator } from '../auth';
import type { UserStore } from '../store';
import { ApiError, badRequest, notFound, payloadTooLarge, unauthorized } from '../errors';
import { silentLogger, type Logger } from '../lib/logger';
import { bindRunId, runIdFromPath, runWithRequestScope, scopeFields } from '../lib/requestContext';
import type { Orchestrator } from '../orchestrator';
import { EVIDENCE_KINDS, type EvidenceKind, type Stores } from '../store';
import { buildPolicy, verifyClaims } from '../claims/verify';
import { createProcessCoordinator, type Coordinator } from '../coord';
import type { BlobStore } from '../blob';

export interface AppDependencies {
  orchestrator: Orchestrator;
  config: Config;
  capabilities: () => Promise<Capabilities>;
  /**
   * The configured stores, so `/health` can say which backend is in use and
   * whether it is reachable. Optional: a unit test that injects an orchestrator
   * need not describe a deployment, and `/health` then omits the field rather
   * than inventing one.
   */
  stores?: Stores;
  /**
   * Where the rate limit and the stage lock live. Defaults to the in-process
   * coordinator, which is right for one instance and says so in `/health`.
   * Injected so a test can shorten the window or point at a Redis.
   */
  coordinator?: Coordinator;
  /**
   * Where artefact bytes live, so `/health` can say whether they are readable
   * as well as whether records can be written.
   */
  blobs?: BlobStore;
  /**
   * Who is calling. Built from `config.auth` when a test does not inject one, so
   * the app always enforces what the configuration says rather than what a
   * caller remembered to wire.
   */
  authenticator?: Authenticator;
  /** Accounts. Required by `oidc` mode; `stores.users` supplies it in production. */
  users?: UserStore;
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
  stores,
  coordinator = createProcessCoordinator(),
  blobs,
  authenticator,
  users,
  logger = silentLogger(),
}: AppDependencies): Hono<{ Variables: { principal: Principal | null } }> {
  const app = new Hono<{ Variables: { principal: Principal | null } }>();
  const settings = authSettings(config);

  // Accounts need somewhere to live. `buildServer` passes `stores.users`; a
  // test that never authenticates a person can leave it out, and `oidc` mode
  // then fails at the first verification with a message instead of a crash.
  const userStore: UserStore | null = users ?? stores?.users ?? null;
  const auth: Authenticator =
    authenticator ??
    createAuthenticator({
      settings,
      users:
        userStore ??
        ({
          get: async () => null,
          list: async () => [],
          upsertOnLogin: async () => {
            throw new ApiError(
              503,
              'auth_unavailable',
              'AEROSCRIBE_AUTH=oidc needs a user store; this process was built without one.',
            );
          },
          setRole: async () => {
            throw new ApiError(503, 'auth_unavailable', 'No user store is configured.');
          },
        } satisfies UserStore),
      logger,
    });

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
      // `PATCH` is only for `/api/v1/users/:sub`, but a role change is a PATCH and
      // a preflight that omits it is a browser-only failure the tests would not
      // otherwise see.
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  /**
   * Authentication, then the rate limit.
   *
   * The order is the reverse of what it was, and the reason is the identity the
   * limiter needs: a budget keyed by subject can only be spent after the subject
   * is known. Signature verification is cheap next to a database write, the
   * shared key is compared in constant time, and an unauthenticated flood still
   * fails here before any handler or stage runs.
   *
   * `/api/v1/auth/config` is exempt: it is how a client discovers *how* to log
   * in, so it cannot itself require a login. Everything in it is public.
   */
  app.use('/api/*', async (context, next) => {
    if (context.req.path === '/api/v1/auth/config') return next();

    let principal: Principal | null = null;
    try {
      principal = await auth.authenticate(context.req.raw);
    } catch (error) {
      if (error instanceof ApiError) {
        logger.warn('http.unauthorised', {
          ...scopeFields(),
          path: context.req.path,
          code: error.code,
        });
      }
      throw error;
    }
    context.set('principal', principal);

    // A subject has a budget of their own; a shared key or an anonymous caller
    // keeps the key it always had, so `token` mode behaves exactly as before.
    const key = principal
      ? `user:${principal.sub}`
      : clientKey(context.req.header('authorization'), context.req.header('x-forwarded-for'));
    const result = await coordinator.limit(key);
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

  /** The principal, when this deployment has one. */
  const principalOf = (context: {
    get: (key: 'principal') => Principal | null | undefined;
  }): Principal | null => context.get('principal') ?? null;

  /**
   * Who the audit trail records.
   *
   * In `oidc` mode this is the verified subject and nothing else — the body's
   * `actor` is ignored, which is the whole fix: before accounts, any caller
   * could approve a gate as "someone-else" and the trail would believe it.
   */
  const actorFor = (principal: Principal | null, claim: unknown): string => {
    if (principal !== null) return auditActor(principal);
    return typeof claim === 'string' && claim.trim() !== '' ? claim : 'anonymous';
  };

  /**
   * Refuse unless the caller may do this to this run.
   *
   * In `none` and `token` mode there is no principal, so there is nothing to
   * check — that is the documented behaviour of a deployment with one shared
   * credential, not an oversight. In `oidc` mode the middleware has already
   * refused a request without one, so this is always a real decision.
   */
  const requireRun = async (
    principal: Principal | null,
    action: Action,
    run: { ownerSub?: string | null },
  ): Promise<void> => {
    if (principal !== null) authorize(principal, action, run);
  };

  /**
   * Liveness, plus what the process is actually backed by.
   *
   * The store probe is the only check here that can fail for a reason the
   * operator can fix (an unwritable data directory today, an unreachable
   * database once another adapter exists), so it decides the status code: a
   * service that cannot persist anything is not healthy, and a `200` would tell
   * a load balancer to keep sending it work.
   */
  app.get('/health', async (context) => {
    const caps = await capabilities();
    const [store, coordination, blobProbe] = await Promise.all([
      stores ? stores.probe() : Promise.resolve(null),
      coordinator.probe(),
      blobs ? blobs.probe() : Promise.resolve(null),
    ]);
    // Two independent ways to be unhealthy: state that cannot be written, and
    // shared state that cannot be reached (so a limit two instances were
    // supposed to share is not being enforced).
    const healthy =
      (store === null || store.ok) && coordination.ok && (blobProbe === null || blobProbe.ok);
    return context.json(
      {
        status: healthy ? 'ok' : 'degraded',
        service: '@aeroscribe/api',
        version: config.version,
        commit: config.commit,
        logLevel: config.logLevel,
        capabilities: caps,
        // Kept for every existing client and smoke test; `auth.mode` says which
        // kind of credential this is, which a boolean cannot.
        authRequired: caps.auth.required,
        authMode: caps.auth.mode,
        ...(store ? { store } : {}),
        coordination,
        ...(blobProbe ? { blobs: blobProbe } : {}),
      },
      healthy ? 200 : 503,
    );
  });

  app.get('/api/v1/capabilities', async (context) => context.json(await capabilities()));

  // How to authenticate, for a client that has not authenticated yet.
  app.get('/api/v1/auth/config', async (context) => context.json(auth.describe()));

  // Who the server thinks the caller is. In `none`/`token` mode there is no
  // answer, and `principal: null` is that answer.
  app.get('/api/v1/me', async (context) => {
    const principal = principalOf(context);
    return context.json({ authMode: settings.mode, principal });
  });

  // ── Accounts ──────────────────────────────────────────────────────────────
  // Admin-only, and only meaningful in `oidc` mode: a deployment that
  // authenticates a shared key has no people to administer, and saying so is
  // better than answering an empty list that looks like "no accounts yet".

  const requireAdmin = (
    context: { get: (key: 'principal') => Principal | null | undefined },
    action: 'users:read' | 'users:write',
  ): Principal => {
    if (settings.mode !== 'oidc' || userStore === null) {
      throw new ApiError(
        403,
        'auth_mode_unsupported',
        `Accounts require AEROSCRIBE_AUTH=oidc; this deployment authenticates with "${settings.mode}", which has no users.`,
      );
    }
    const principal = principalOf(context);
    if (principal === null) throw unauthorized();
    authorize(principal, action);
    return principal;
  };

  app.get('/api/v1/users', async (context) => {
    requireAdmin(context, 'users:read');
    const users = await userStore!.list();
    return context.json({ users });
  });

  app.patch('/api/v1/users/:sub', async (context) => {
    const admin = requireAdmin(context, 'users:write');
    const body = await readJson<{ role?: unknown }>(context.req.raw);
    if (body.role !== 'researcher' && body.role !== 'reviewer' && body.role !== 'admin') {
      throw badRequest('"role" must be one of researcher, reviewer, admin.');
    }

    const sub = context.req.param('sub');
    // An admin demoting themselves can lock the deployment out of its own
    // account list. Refuse, and name why.
    if (sub === admin.sub && body.role !== 'admin') {
      throw new ApiError(
        409,
        'self_demotion',
        'An admin cannot remove their own admin role; ask another admin.',
      );
    }

    // `setRole` refuses an unknown subject, and a `404` says what a thrown
    // `Error` inside the store would hide behind a `500`.
    if ((await userStore!.get(sub)) === null) throw notFound(`No account with subject "${sub}".`);
    const user = await userStore!.setRole(sub, body.role);
    await orchestrator.recordAudit({
      action: 'user.role_changed',
      runId: null,
      actor: auditActor(admin),
      detail: { sub, role: body.role },
    });
    return context.json({ user });
  });

  app.get('/api/v1/runs', async (context) => {
    const principal = principalOf(context);
    const runs = await orchestrator.listRuns();
    // A researcher sees their own runs. A reviewer or an admin sees every run,
    // because judging one you cannot read is not a thing.
    if (principal === null || seesEveryRun(principal)) return context.json({ runs });
    return context.json({ runs: runs.filter((run) => run.ownerSub === principal.sub) });
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

    const principal = principalOf(context);
    if (principal !== null) authorize(principal, 'run:create');

    const run = await orchestrator.createRun({
      topic: body.topic,
      journal: body.journal,
      // The display name. In `oidc` mode the audit trail uses the subject
      // instead, so a caller cannot choose how the record names them.
      researcher: typeof body.researcher === 'string' ? body.researcher : undefined,
      ownerSub: principal?.sub,
      options: sanitiseOptions(body.options),
    });

    return context.json({ run }, 201);
  });

  app.get('/api/v1/runs/:id', async (context) => {
    const run = await orchestrator.getRun(context.req.param('id'));
    await requireRun(principalOf(context), 'run:read', run);
    return context.json({ run });
  });

  app.post('/api/v1/runs/:id/advance', async (context) => {
    const body = await readJson<{ actor?: unknown }>(context.req.raw, { optional: true });
    const principal = principalOf(context);
    const run = await orchestrator.getRun(context.req.param('id'));
    await requireRun(principal, 'run:advance', run);
    const result = await orchestrator.advance(
      context.req.param('id'),
      actorFor(principal, body.actor),
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
    const principal = principalOf(context);
    const run = await orchestrator.getRun(context.req.param('id'));
    await requireRun(principal, 'gate:approve', run);
    const next = await orchestrator.approveGate(
      context.req.param('id'),
      context.req.param('gateId'),
      actorFor(principal, body.actor),
    );
    return context.json({ run: next });
  });

  app.post('/api/v1/runs/:id/gates/:gateId/reject', async (context) => {
    const body = await readJson<{ actor?: unknown; note?: unknown }>(context.req.raw, {
      optional: true,
    });
    const principal = principalOf(context);
    const run = await orchestrator.getRun(context.req.param('id'));
    await requireRun(principal, 'gate:reject', run);
    const next = await orchestrator.requestRevision(
      context.req.param('id'),
      context.req.param('gateId'),
      actorFor(principal, body.actor),
      typeof body.note === 'string' ? body.note : undefined,
    );
    return context.json({ run: next });
  });

  app.get('/api/v1/runs/:id/evidence', async (context) => {
    const kindParam = context.req.query('kind');
    if (kindParam && !EVIDENCE_KINDS.includes(kindParam as EvidenceKind)) {
      throw badRequest(`Unknown evidence kind "${kindParam}".`, { allowed: EVIDENCE_KINDS });
    }
    await requireRun(
      principalOf(context),
      'run:read',
      await orchestrator.getRun(context.req.param('id')),
    );
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
    // A re-check writes evidence, so it is the owner's or an admin's action.
    await requireRun(
      principalOf(context),
      'run:advance',
      await orchestrator.getRun(context.req.param('id')),
    );
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

  app.get('/api/v1/runs/:id/references', async (context) => {
    await requireRun(
      principalOf(context),
      'run:read',
      await orchestrator.getRun(context.req.param('id')),
    );
    return context.json(await orchestrator.referenceStatus(context.req.param('id')));
  });

  // ── Manuscript artefacts ──────────────────────────────────────────────────
  //
  // Both routes serve the file the record hashed, and refuse when the file on
  // disk no longer matches it. A PDF that was never typeset is a 503 naming the
  // missing capability, not a 404: the run exists, the artefact does not.

  app.get('/api/v1/runs/:id/manuscript.tex', async (context) => {
    await requireRun(
      principalOf(context),
      'run:read',
      await orchestrator.getRun(context.req.param('id')),
    );
    const artefact = await orchestrator.manuscriptArtefact(context.req.param('id'), 'tex');
    context.header('content-type', 'text/x-tex; charset=utf-8');
    context.header('x-content-sha256', artefact.sha256);
    context.header('content-disposition', 'inline; filename="manuscript.tex"');
    return context.body(artefact.kind === 'tex' ? artefact.content : '');
  });

  app.get('/api/v1/runs/:id/manuscript.pdf', async (context) => {
    await requireRun(
      principalOf(context),
      'run:read',
      await orchestrator.getRun(context.req.param('id')),
    );
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

  // An evidence record names its artefacts by digest; this route hands back the
  // bytes and re-hashes them first, so what a client downloads is what the chain
  // recorded. Altered bytes answer `409` rather than streaming anyway.
  app.get('/api/v1/evidence/:seq/artefacts/:name', async (context) => {
    const seq = Number.parseInt(context.req.param('seq'), 10);
    if (!Number.isInteger(seq) || seq < 0)
      throw badRequest('"seq" must be a non-negative integer.');

    // The record names its run, so an artefact is exactly as readable as the
    // evidence that references it — no more.
    const owner = await orchestrator.record(seq);
    // A record can outlive its run. A missing run has no owner, which is the
    // same answer a run created before accounts has: reviewer or admin only.
    const run = await orchestrator.findRun(owner.runId);
    await requireRun(principalOf(context), 'run:read', run ?? { ownerSub: null });
    const artefact = await orchestrator.artefact(seq, context.req.param('name'));
    context.header('content-type', artefact.mediaType);
    context.header('x-content-sha256', artefact.sha256);
    context.header('etag', `"sha256-${artefact.sha256}"`);
    context.header(
      'content-disposition',
      `inline; filename="${artefact.name.replace(/["\\]/g, '_')}"`,
    );
    return context.body(new Uint8Array(artefact.bytes).buffer as ArrayBuffer);
  });

  // The audit trail is the answer to "who approved this gate": it is readable
  // per run, and never writable over HTTP.
  app.get('/api/v1/audit', async (context) => {
    const runId = context.req.query('runId');
    const limit = Number(context.req.query('limit') ?? '200');
    const principal = principalOf(context);

    // Asking about a run you cannot read is a `403`, not an empty list: an empty
    // list is indistinguishable from "nothing happened".
    if (runId && principal !== null) {
      await requireRun(principal, 'audit:read', await orchestrator.getRun(runId));
    }

    const { entries, malformed } = await orchestrator.auditTrail({
      ...(runId ? { runId } : {}),
      limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 2000) : 200,
    });

    // A researcher sees the trail of their own runs — and no entries that belong
    // to nobody, because those are not theirs to read.
    if (principal !== null && !seesEveryRun(principal)) {
      const owned = new Set(
        (await orchestrator.listRuns())
          .filter((run) => run.ownerSub === principal.sub)
          .map((run) => run.id),
      );
      return context.json({
        entries: entries.filter((entry) => entry.runId !== null && owned.has(entry.runId)),
        malformed,
      });
    }

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

    await requireRun(principalOf(context), 'run:read', await orchestrator.getRun(body.runId));
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
