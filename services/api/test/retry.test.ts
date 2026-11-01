// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  backoffDelay,
  fetchWithRetry,
  isRetryableStatus,
  parseRetryAfter,
} from '../src/literature/http';
import { FixedWindowCounter } from '../src/coord';

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : '{}', {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const noSleep = async () => undefined;

describe('backoffDelay', () => {
  it('follows the RULE-042 schedule: immediate, then 2s, 4s, 8s, 16s', () => {
    expect([1, 2, 3, 4, 5].map((attempt) => backoffDelay(attempt, 2000, 30_000))).toEqual([
      0, 2000, 4000, 8000, 16_000,
    ]);
  });

  it('caps the delay', () => {
    expect(backoffDelay(10, 2000, 30_000)).toBe(30_000);
  });
});

describe('parseRetryAfter', () => {
  it('accepts seconds and HTTP dates', () => {
    const now = () => Date.parse('2026-10-30T12:00:00Z');
    expect(parseRetryAfter('5', now)).toBe(5000);
    expect(parseRetryAfter('Fri, 30 Oct 2026 12:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter('not a date', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe('isRetryableStatus', () => {
  it('retries rate limits and server errors only', () => {
    expect([408, 425, 429, 500, 502, 503, 504].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404, 422].some(isRetryableStatus)).toBe(false);
  });
});

describe('fetchWithRetry', () => {
  it('names a timeout as a timeout, not as a caller abort', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const error = await fetchWithRetry(
      'https://example.org',
      {},
      { fetchImpl, sleep: noSleep, attempts: 1, timeoutMs: 5 },
    ).catch((caught: unknown) => caught);
    expect((error as Error).message).toMatch(/timed out after 5ms/);
  });

  it('propagates a caller abort with the caller-supplied reason', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('provider timed out after 20ms', 'TimeoutError'));

    const error = await fetchWithRetry(
      'https://example.org',
      {},
      { fetchImpl: vi.fn(), sleep: noSleep, signal: controller.signal },
    ).catch((caught: unknown) => caught);
    expect((error as Error).message).toMatch(/provider timed out after 20ms/);
  });

  it('includes the DNS-style cause when the network fails', async () => {
    const failure = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.crossref.org'), {
        code: 'ENOTFOUND',
      }),
    });
    const fetchImpl = vi.fn().mockRejectedValue(failure);

    const error = await fetchWithRetry(
      'https://api.crossref.org',
      {},
      { fetchImpl, sleep: noSleep, attempts: 2 },
    ).catch((caught: unknown) => caught);
    expect((error as Error).message).toContain('ENOTFOUND');
    expect((error as Error).message).toMatch(/2 attempts/);
  });

  it('succeeds on the first attempt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200));
    const result = await fetchWithRetry('https://example.org', {}, { fetchImpl, sleep: noSleep });
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const result = await fetchWithRetry('https://example.org', {}, { fetchImpl, sleep: noSleep });
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget and throws UpstreamError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(500));
    await expect(
      fetchWithRetry('https://example.org', {}, { fetchImpl, sleep: noSleep, attempts: 3 }),
    ).rejects.toThrow(/gave up after 3 attempts/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns client errors without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(404));
    const result = await fetchWithRetry('https://example.org', {}, { fetchImpl, sleep: noSleep });
    expect(result.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries network failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response(200));
    const result = await fetchWithRetry('https://example.org', {}, { fetchImpl, sleep: noSleep });
    expect(result.status).toBe(200);
  });

  it('honours Retry-After between attempts', async () => {
    const waits: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, { 'retry-after': '3' }))
      .mockResolvedValueOnce(response(200));

    await fetchWithRetry(
      'https://example.org',
      {},
      { fetchImpl, attempts: 2, sleep: async (ms) => void waits.push(ms) },
    );

    expect(waits).toContain(3000);
  });
});

describe('FixedWindowCounter', () => {
  it('allows up to the limit per window then blocks until reset', async () => {
    let now = 0;
    const limiter = new FixedWindowCounter({ limit: 2, windowMs: 1000, now: () => now });

    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(false);

    now = 1001;
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('keeps separate budgets per key', () => {
    const limiter = new FixedWindowCounter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });
});
