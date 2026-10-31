// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../src/lib/shutdown';

function harness({ timeoutMs }: { timeoutMs?: number } = {}) {
  const logs: string[] = [];
  const exits: number[] = [];
  let closed: (() => void) | null = null;
  let closeCalls = 0;

  const shutdown = createShutdown({
    close: (onClosed) => {
      closeCalls += 1;
      closed = onClosed;
    },
    exit: (code) => exits.push(code),
    log: (message) => logs.push(message),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

  return {
    shutdown,
    logs,
    exits,
    get closeCalls() {
      return closeCalls;
    },
    // Simulate the listener finishing: no request is left in flight.
    finish: () => closed?.(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createShutdown', () => {
  it('closes the listener before exiting, and only after it has drained', () => {
    const harnessed = harness();
    const { shutdown, logs, exits } = harnessed;

    shutdown('SIGTERM');
    expect(harnessed.closeCalls).toBe(1);
    expect(exits).toEqual([]); // still draining
    expect(logs[0]).toMatch(/SIGTERM received/);

    harnessed.finish();
    expect(exits).toEqual([0]);
    expect(logs.at(-1)).toBe('closed');
  });

  it('faces a second signal only once', () => {
    const harnessed = harness();
    harnessed.shutdown('SIGTERM');
    harnessed.shutdown('SIGINT');
    harnessed.shutdown('SIGTERM');

    expect(harnessed.closeCalls).toBe(1);
    harnessed.finish();
    expect(harnessed.exits).toEqual([0]);
  });

  it('gives up after the deadline and exits non-zero', () => {
    vi.useFakeTimers();
    const harnessed = harness();
    harnessed.shutdown('SIGTERM');

    // A stage is still waiting on the solver, so the listener never drains.
    vi.advanceTimersByTime(30_000);

    expect(harnessed.exits).toEqual([1]);
    expect(harnessed.logs.at(-1)).toMatch(/timed out/i);
  });

  it('does not exit twice when the deadline fires and the listener drains late', () => {
    vi.useFakeTimers();
    const harnessed = harness({ timeoutMs: 5_000 });
    harnessed.shutdown('SIGTERM');
    vi.advanceTimersByTime(5_000);
    expect(harnessed.exits).toEqual([1]);

    harnessed.finish();
    expect(harnessed.exits).toEqual([1]);
  });

  it('reports that it has started', () => {
    const harnessed = harness();
    expect(harnessed.shutdown.started).toBe(false);
    harnessed.shutdown('SIGTERM');
    expect(harnessed.shutdown.started).toBe(true);
  });
});
