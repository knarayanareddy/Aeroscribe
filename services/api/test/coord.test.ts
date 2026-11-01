// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FixedWindowCounter, createCoordinator, createProcessCoordinator } from '../src/coord';

/**
 * The in-process coordinator.
 *
 * Each test here names a way a single-instance deployment is *allowed* to be
 * weaker than a shared one, so the weakness is written down instead of being
 * discovered when a second replica arrives:
 *
 * - a second `acquireRun` in one process is refused, but another process would
 *   not see this lock at all (that is what `AEROSCRIBE_COORDINATION=redis` is
 *   for, and the probe says so);
 * - a released lease only frees the lock for its own owner;
 * - the counter is a fixed window, so the arithmetic is testable without a
 *   clock.
 */

describe('FixedWindowCounter', () => {
  it('refills on the window boundary and never reports a negative budget', () => {
    let now = 1_000;
    const counter = new FixedWindowCounter({ limit: 2, windowMs: 500, now: () => now });

    expect(counter.check('a')).toEqual({ allowed: true, remaining: 1, resetAt: 1_500 });
    expect(counter.check('a')).toEqual({ allowed: true, remaining: 0, resetAt: 1_500 });
    // Still inside the window: refused, and `remaining` clamps at zero rather
    // than going negative for every further request.
    expect(counter.check('a')).toMatchObject({ allowed: false, remaining: 0 });

    now = 1_500;
    expect(counter.check('a')).toMatchObject({ allowed: true, remaining: 1, resetAt: 2_000 });

    // `reset` exists for tests and for a deliberate operator reset; it must
    // actually empty the buckets.
    counter.reset();
    expect(counter.check('a')).toMatchObject({ allowed: true, remaining: 1, resetAt: 2_000 });
  });
});

describe('process coordinator', () => {
  it('refuses a second lease in one process and lets only the owner release it', async () => {
    const first = createProcessCoordinator({ newOwner: () => 'owner-a' });
    const second = createProcessCoordinator({ newOwner: () => 'owner-b' });

    const lease = await first.acquireRun('run-1');
    expect(lease?.owner).toBe('owner-a');
    expect(await first.acquireRun('run-1')).toBeNull();

    // A stale lease object must not free a lock somebody else now holds.
    const other = await second.acquireRun('run-1');
    expect(other).not.toBeNull();
    await lease?.release();
    expect(await second.acquireRun('run-1')).toBeNull();

    await other?.release();
    const reacquired = await second.acquireRun('run-1');
    expect(reacquired?.owner).toBe('owner-b');
    await reacquired?.release();
  });

  it('says in its probe that nothing is shared', async () => {
    // The one thing an operator must not have to guess. Two instances each get
    // this answer, which is the truth for both of them.
    const probe = await createProcessCoordinator().probe();
    expect(probe.backend).toBe('process');
    expect(probe.ok).toBe(true);
    expect(probe.detail).toMatch(/per process/);
    expect(probe.detail).toMatch(/second API instance/);
  });

  it('builds through the factory, so both backends share one entry point', async () => {
    const coordinator = createCoordinator({ backend: 'process', limit: 1, windowMs: 60_000 });
    expect(coordinator.backend).toBe('process');
    expect(await coordinator.limit('k')).toMatchObject({ allowed: true, remaining: 0 });
    expect(await coordinator.limit('k')).toMatchObject({ allowed: false });
    // No connection to drain, but shutdown must not have to special-case it.
    expect(coordinator.close).toBeUndefined();
  });

  it('refuses to be told to use Redis without an address', () => {
    expect(() => createCoordinator({ backend: 'redis' })).toThrow(/AEROSCRIBE_REDIS_URL/);
  });
});
