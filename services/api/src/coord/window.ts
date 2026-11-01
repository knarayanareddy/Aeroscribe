export interface FixedWindowOptions {
  /** Requests allowed per window. RULE-013 asks for 60 a minute by default. */
  limit?: number;
  windowMs?: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter.
 *
 * Kept separate from the coordinator that uses it so the arithmetic can be
 * tested without a clock, a socket or a Redis. A fixed window lets a caller
 * spend two windows' worth of budget around a boundary (60 at 59.9s and 60 at
 * 60.1s); that is a deliberate trade — a sliding log would need one stored
 * timestamp per request, and for a prototype API the point of the limit is to
 * stop a runaway client, not to bill precisely.
 */
export class FixedWindowCounter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: FixedWindowOptions = {}) {
    this.limit = options.limit ?? 60;
    this.windowMs = options.windowMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Record a hit and report whether the caller is still inside its budget. */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const timestamp = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= timestamp) {
      const fresh: Bucket = { count: 1, resetAt: timestamp + this.windowMs };
      this.buckets.set(key, fresh);
      return { allowed: true, remaining: this.limit - 1, resetAt: fresh.resetAt };
    }

    bucket.count += 1;
    return {
      allowed: bucket.count <= this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}
