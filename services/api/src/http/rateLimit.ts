export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit?: number;
  windowMs?: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter (RULE-013 asks for a default of 60 requests/minute).
 *
 * In-process only: with several API instances each gets its own budget, which
 * is acceptable for a prototype and called out in `docs/BACKEND.md`. Buckets are
 * keyed by API key when present, otherwise by client address.
 */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimitOptions = {}) {
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
