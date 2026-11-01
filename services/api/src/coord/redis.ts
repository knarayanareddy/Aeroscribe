import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import IORedis from 'ioredis';
import { CoordinationUnavailableError } from '../errors';
import type { Coordinator, CoordinationProbe, RateLimitDecision, RunLease } from './ports';

/**
 * Redis, for the two things a single process cannot decide alone.
 *
 * Both operations are the ones the roadmap named, because the obvious
 * read-then-write versions are wrong under concurrency:
 *
 * - **Rate limit**: `INCR` and `PEXPIRE` in one script, returning the count and
 *   the remaining TTL. Two `INCR`s cannot see the same value, so two instances
 *   cannot both spend the last request in a window.
 * - **Stage lock**: `SET key owner NX PX ttl` claims it atomically; a heartbeat
 *   script extends it *only if the caller is still the owner*; release is a
 *   compare-and-delete for the same reason. A lock that expires while a slow
 *   solver runs is not a bug — the lease is the honest limit — and the loser
 *   must not delete the winner's lock when it finally returns.
 *
 * Failures throw `CoordinationUnavailableError` (503). Falling back to the
 * in-process counter would be worse than failing: the caller would believe a
 * limit was enforced when it was not.
 */

/** Strips the password from a `redis://` URL so it can be logged. */
export function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    }
    return url;
  } catch {
    // Not a URL we understand; print nothing rather than risk a secret.
    return 'redis://(unparseable)';
  }
}

const COUNT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

const EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface RedisCoordinatorOptions {
  /** `AEROSCRIBE_REDIS_URL`. */
  url: string;
  /** Requests per window; RULE-013's default is 60/minute. */
  limit?: number;
  windowMs?: number;
  /** How long a stage lease lives without a heartbeat. */
  lockTtlMs?: number;
  /** Prefix for every key this process writes, so instances can share a database. */
  keyPrefix?: string;
  /** Injected in tests so a lease has a predictable name. */
  newOwner?: () => string;
  /**
   * How long a command may wait for a connection that is still being made.
   *
   * Without this a coordinator built at boot answers `503` for the few
   * milliseconds before the socket is up — technically true, practically a
   * false alarm on every deploy. Past the deadline it is a real outage and the
   * caller gets the `503`.
   */
  readyTimeoutMs?: number;
  /** Reported by `/health` when the connection fails. */
  log?: (event: string, fields: Record<string, unknown>) => void;
}

export function createRedisCoordinator(options: RedisCoordinatorOptions): Coordinator {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const lockTtlMs = options.lockTtlMs ?? 30_000;
  const prefix = options.keyPrefix ?? 'aeroscribe';
  const redacted = redactRedisUrl(options.url);
  const newOwner =
    options.newOwner ??
    (() => `${hostname()}-${process.pid}-${randomUUID().replace(/-/g, '').slice(0, 8)}`);

  const client = new IORedis(options.url, {
    // Fail a request quickly when the connection is down instead of holding it
    // open until the client gives up: an API that cannot count requests should
    // answer 503 now, not after a retry budget.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    // Reconnect forever, backing off to two seconds: Redis restarting is a
    // normal event and the process should recover without being restarted.
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
  });

  // Without this listener an idle connection that errors emits `error` with no
  // handler, which terminates the process (the same trap the pg pool had).
  client.on('error', (error: Error) => {
    options.log?.('coord.redis_error', { url: redacted, error: error.message });
  });

  const unavailable = (error: unknown): CoordinationUnavailableError =>
    new CoordinationUnavailableError(
      'redis',
      `${redacted}: ${error instanceof Error ? error.message : String(error)}`,
    );

  const readyTimeoutMs = options.readyTimeoutMs ?? 2_000;

  /**
   * Commands are only issued on a live connection: with the offline queue
   * disabled they would otherwise fail the moment a client is constructed,
   * which is exactly what happens on the first request after boot.
   */
  const ensureReady = async (): Promise<void> => {
    if (client.status === 'ready') return;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
        clearTimeout(timer);
        client.off('ready', onReady);
        if (error) reject(error);
        else resolve();
      };
      const onReady = (): void => finish();
      const timer = setTimeout(
        () => finish(new Error(`no connection within ${readyTimeoutMs}ms`)),
        readyTimeoutMs,
      );
      timer.unref?.();
      client.once('ready', onReady);
      // A client constructed while the server is down is already retrying; the
      // `ready` listener above fires when it succeeds.
      if (client.status === 'wait' || client.status === 'end' || client.status === 'close') {
        client.connect().catch(() => undefined);
      }
    }).catch((error: unknown) => {
      throw unavailable(error);
    });
  };

  return {
    backend: 'redis',

    async limit(key: string): Promise<RateLimitDecision> {
      await ensureReady();
      const now = Date.now();
      let reply: unknown;
      try {
        reply = await client.eval(COUNT_SCRIPT, 1, `${prefix}:ratelimit:${key}`, String(windowMs));
      } catch (error) {
        throw unavailable(error);
      }
      const [count, ttl] = Array.isArray(reply) ? (reply as [number, number]) : [1, windowMs];
      const remaining = Math.max(0, limit - Number(count));
      // A negative TTL means the key outlived its expiry (clock skew, a manual
      // write); treat the window as full so the answer is still bounded.
      const resetAt = now + (typeof ttl === 'number' && ttl > 0 ? ttl : windowMs);
      return { allowed: Number(count) <= limit, remaining, resetAt };
    },

    async acquireRun(runId: string): Promise<RunLease | null> {
      await ensureReady();
      const key = `${prefix}:runlock:${runId}`;
      const owner = newOwner();
      let claimed: unknown;
      try {
        claimed = await client.set(key, owner, 'PX', lockTtlMs, 'NX');
      } catch (error) {
        throw unavailable(error);
      }
      if (claimed !== 'OK') return null;

      // Keep the lease alive while the stage runs; a stage can take minutes and
      // the TTL is what stops a crashed instance from blocking the run forever.
      const heartbeat = setInterval(
        () => {
          void client
            .eval(EXTEND_SCRIPT, 1, key, owner, String(lockTtlMs))
            .catch((error: Error) => {
              options.log?.('coord.lease_heartbeat_failed', {
                run_id: runId,
                error: error.message,
              });
            });
        },
        Math.max(250, Math.floor(lockTtlMs / 3)),
      );
      // A lease must never be the reason the process stays alive.
      heartbeat.unref?.();

      return {
        runId,
        owner,
        release: async () => {
          clearInterval(heartbeat);
          try {
            await client.eval(RELEASE_SCRIPT, 1, key, owner);
          } catch (error) {
            // The lease expires on its own; failing here must not turn a
            // finished stage into an error for the caller.
            options.log?.('coord.lease_release_failed', {
              run_id: runId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      };
    },

    async probe(): Promise<CoordinationProbe> {
      try {
        // A client built a moment ago is still connecting; report on the
        // connection it is trying to make rather than on its first millisecond.
        await ensureReady();
        const started = Date.now();
        await client.ping();
        return {
          backend: 'redis',
          ok: true,
          detail: `redis at ${redacted} answered in ${Date.now() - started}ms; limits and run locks are shared`,
        };
      } catch (error) {
        return {
          backend: 'redis',
          ok: false,
          detail: `redis at ${redacted} did not answer: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    async close(): Promise<void> {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}
