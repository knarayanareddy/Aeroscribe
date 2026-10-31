import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context, carried without threading a parameter through every
 * function.
 *
 * A stage handler calls a provider, which calls `fetchWithRetry`, which logs.
 * None of them takes a logger, and none of them should: the correlation id is a
 * property of the request, not of those functions' contracts. `AsyncLocalStorage`
 * propagates it across every `await` in the call tree, so a log line written
 * eight frames deep still says which request and which run produced it.
 */
export interface RequestScope {
  requestId: string;
  runId?: string;
  /** Authenticated subject, once accounts exist (see `docs/ROADMAP.md` § 10). */
  subject?: string;
}

const storage = new AsyncLocalStorage<RequestScope>();

/** Run `fn` with `scope` bound for every async continuation it creates. */
export function runWithRequestScope<T>(scope: RequestScope, fn: () => T): T {
  return storage.run({ ...scope }, fn);
}

export function currentRequestScope(): RequestScope | undefined {
  return storage.getStore();
}

/** Attach a run id to the active scope (no-op outside a request). */
export function bindRunId(runId: string): void {
  const scope = storage.getStore();
  if (scope) scope.runId = runId;
}

/** Log fields derived from the active scope; empty outside a request. */
export function scopeFields(): { request_id?: string; run_id?: string; subject?: string } {
  const scope = storage.getStore();
  if (!scope) return {};
  return {
    request_id: scope.requestId,
    ...(scope.runId ? { run_id: scope.runId } : {}),
    ...(scope.subject ? { subject: scope.subject } : {}),
  };
}

/**
 * The run id in a request path, if the route is run-scoped.
 *
 * `/api/v1/runs/<id>/...` is the only shape that carries one; matching it here
 * means a new run-scoped route is correlated automatically.
 */
export function runIdFromPath(path: string): string | undefined {
  const match = /^\/api\/v1\/runs\/([^/?#]+)/.exec(path);
  return match?.[1];
}
