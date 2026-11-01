import { FixedWindowCounter, type FixedWindowOptions } from './window';
import type { Coordinator, CoordinationProbe, RateLimitDecision, RunLease } from './ports';

export interface ProcessCoordinatorOptions extends FixedWindowOptions {
  /** Injected by tests so a lease has a predictable name. */
  newOwner?: () => string;
}

/**
 * The single-instance coordinator: a counter and a `Set`.
 *
 * This is what a deployment that has *not* configured Redis gets, and it is
 * honest as long as it is visible — `/health` reports `backend: "process"` and
 * the detail line says the state is not shared. Two instances behind a load
 * balancer then get 60 requests each, not 60 between them, which is exactly
 * the sentence `docs/BACKEND.md` prints and the reason `AEROSCRIBE_REDIS_URL`
 * exists.
 */
export function createProcessCoordinator(options: ProcessCoordinatorOptions = {}): Coordinator {
  const counter = new FixedWindowCounter(options);
  const held = new Map<string, string>();
  const newOwner = options.newOwner ?? (() => `process-${process.pid}`);

  return {
    backend: 'process',

    async limit(key: string): Promise<RateLimitDecision> {
      return counter.check(key);
    },

    async acquireRun(runId: string): Promise<RunLease | null> {
      if (held.has(runId)) return null;
      const owner = newOwner();
      held.set(runId, owner);
      return {
        runId,
        owner,
        release: async () => {
          // Only the holder may release; a stale lease object must not free a
          // lock a newer attempt has taken.
          if (held.get(runId) === owner) held.delete(runId);
        },
      };
    },

    async probe(): Promise<CoordinationProbe> {
      return {
        backend: 'process',
        ok: true,
        detail:
          'rate limits and run locks are per process; a second API instance does not share them',
      };
    },
  };
}
