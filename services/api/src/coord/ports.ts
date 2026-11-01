/**
 * Ports for the things one API instance cannot decide alone.
 *
 * Two of them, and they are the same problem: a request budget and a stage
 * lock both only work if every instance sees the same counter. Until ROADMAP
 * §8 D3 there was one instance per deployment, so a `Map` was a correct
 * answer; it stops being one the moment a second instance exists, and the
 * failure is silent — each instance politely enforces its own 60 requests, or
 * runs the same stage twice, and nothing in the logs says so.
 *
 * A port here is deliberately tiny: `limit` and `acquireRun` are the only two
 * questions the rest of the API asks, `probe` is what `/health` reports, and
 * `close` is what shutdown drains. Implementations must answer honestly about
 * what they can promise — `backend: 'process'` tells a reader the counters are
 * per instance, and `/health` shows it.
 */

/** Where shared state lives. `process` means "not shared at all". */
export type CoordinationBackend = 'process' | 'redis';

/** What `/health` says about the coordinator. */
export interface CoordinationProbe {
  backend: CoordinationBackend;
  /** False means the shared state cannot be reached, so limits are not enforced. */
  ok: boolean;
  /** One sentence: what was probed and what came back. */
  detail: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window; never negative. */
  remaining: number;
  /** Epoch milliseconds at which the window resets. */
  resetAt: number;
}

/**
 * A held stage lock.
 *
 * `release` must only free the lock if this lease still owns it: a stage that
 * overruns its lease is allowed to lose it (that is what the expiry is for),
 * and the loser must not delete the winner's lock on the way out.
 */
export interface RunLease {
  readonly runId: string;
  /** Identifies this instance's claim; useful in logs and in tests. */
  readonly owner: string;
  release(): Promise<void>;
}

export interface Coordinator {
  readonly backend: CoordinationBackend;
  /** Count one request and say whether the caller is still inside its budget. */
  limit(key: string): Promise<RateLimitDecision>;
  /**
   * Claim the right to execute a run's current stage.
   *
   * `null` means another instance holds it. An implementation that cannot tell
   * (Redis unreachable) must throw `CoordinationUnavailableError` rather than
   * answer `null` — "I could not reach the lock" and "somebody else has it" are
   * different facts, and only one of them means the caller may retry later.
   */
  acquireRun(runId: string): Promise<RunLease | null>;
  probe(): Promise<CoordinationProbe>;
  /** Release connections. Synchronous for the in-process coordinator. */
  close?(): Promise<void> | void;
}
