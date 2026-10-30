import { UpstreamError } from '../errors';

export interface RetryOptions {
  /** Total attempts, including the first one. RULE-042 specifies five. */
  attempts?: number;
  /** Delay before attempt 2; doubles for every further attempt. */
  baseDelayMs?: number;
  /** Cap for both the backoff and any `Retry-After` header. */
  maxDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  /** Injectable clock so tests do not wait. */
  now?: () => number;
}

export const DEFAULT_RETRY: Required<
  Pick<RetryOptions, 'attempts' | 'baseDelayMs' | 'maxDelayMs'>
> = {
  attempts: 5,
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Statuses worth retrying: rate limiting and server-side failures. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

/** Parse `Retry-After` (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null, now: () => number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now());
}

/** Exponential backoff: attempt 1 immediate, then 2s, 4s, 8s, 16s (RULE-042). */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  if (attempt <= 1) return 0;
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 2));
}

/**
 * `fetch` with a timeout, exponential backoff and `Retry-After` support. Resolves with the first response that is not retryable (including
 * 4xx, which the caller must interpret); throws `UpstreamError` when every
 * attempt failed or the deadline of the last attempt timed out.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const {
    attempts = DEFAULT_RETRY.attempts,
    baseDelayMs = DEFAULT_RETRY.baseDelayMs,
    maxDelayMs = DEFAULT_RETRY.maxDelayMs,
    timeoutMs = 15_000,
    fetchImpl = fetch,
    sleep = defaultSleep,
    signal,
    now = Date.now,
  } = options;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
    if (delay > 0) await sleep(delay);
    if (signal?.aborted) throw new UpstreamError(url, abortMessage(signal));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Propagate an outer abort into this attempt.
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });

      if (!isRetryableStatus(response.status)) return response;

      lastError = new UpstreamError(url, `HTTP ${response.status} after ${attempt} attempt(s)`, {
        status: response.status,
      });

      const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now);
      if (retryAfter !== null && attempt < attempts) {
        await sleep(Math.min(retryAfter, maxDelayMs));
      }
      // Drain the body so the socket can be reused.
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      // Three different things abort a request, and conflating them makes the
      // provider errors unreadable: the caller cancelled, the provider hung past
      // our own timeout, or the socket failed (DNS, TLS, connection refused).
      lastError =
        controller.signal.aborted && !signal?.aborted
          ? new UpstreamError(url, `timed out after ${timeoutMs}ms`)
          : error;
      if (signal?.aborted) throw new UpstreamError(url, abortMessage(signal));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  throw new UpstreamError(url, `gave up after ${attempts} attempts (${networkMessage(lastError)})`);
}

/** Explain why a signal aborted, preferring the reason the aborter supplied. */
function abortMessage(signal: AbortSignal | undefined): string {
  const reason = signal?.reason as unknown;
  if (reason instanceof Error && reason.name === 'TimeoutError') return reason.message;
  if (typeof reason === 'string' && reason.length > 0) return reason;
  return 'request aborted by caller';
}

/**
 * Fetch failures say only "fetch failed"; the DNS error lives in `cause.code`.
 * Surfacing it is the difference between a useless log line and "ENOTFOUND".
 */
function networkMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown network failure';
  const cause = (error as { cause?: unknown }).cause;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : null;
  return code ? `${error.message} (${code})` : error.message;
}

/**
 * Serialises calls to one host so a burst cannot trip a provider's rate limit.
 * `minIntervalMs` is the minimum time between request *starts*.
 *
 * Named `RequestSpacer`, not `RateLimiter`, because the HTTP layer has a
 * different rate limiter that counts requests per window; two classes with the
 * same name invited exactly the import mistake this rename fixes.
 */
export class RequestSpacer {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private nextAllowed = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    minIntervalMs: number,
    options: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.minIntervalMs = minIntervalMs;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  acquire(): Promise<void> {
    const operation = this.queue.then(async () => {
      const wait = this.nextAllowed - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextAllowed = Math.max(this.now(), this.nextAllowed) + this.minIntervalMs;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
