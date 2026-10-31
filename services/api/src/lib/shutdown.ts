/**
 * Graceful shutdown for the HTTP server.
 *
 * `docker stop` (and most process managers) send SIGTERM, then SIGKILL after a
 * grace period. Node's default action on SIGTERM is to exit immediately, which
 * would cut a stage mid-write: the run file could still say `running` while the
 * evidence record for that stage was never appended.
 *
 * This helper closes the listener first — in-flight requests finish, including
 * their evidence and audit writes — and only then exits. A slow solver must not
 * hold the container open forever, so a deadline forces the exit and lets the
 * next start resume the run from its persisted state.
 *
 * It is separate from `index.ts` so the behaviour can be tested without sending
 * signals to the test runner.
 */
export interface ShutdownOptions {
  /** Close the HTTP listener; call the callback once no request is in flight. */
  close: (onClosed: () => void) => void;
  /** Terminate the process. Injected so tests can observe the exit code. */
  exit: (code: number) => void;
  /** Human-readable progress line. */
  log: (message: string) => void;
  /** How long to wait for in-flight requests before giving up. */
  timeoutMs?: number;
}

export interface Shutdown {
  (signal: string): void;
  /** True once a shutdown has begun, so callers can report it in health checks. */
  readonly started: boolean;
}

export function createShutdown({
  close,
  exit,
  log,
  timeoutMs = 30_000,
}: ShutdownOptions): Shutdown {
  let started = false;
  let exited = false;

  // The deadline and a drained listener can both fire; only the first may exit,
  // so a late drain cannot turn a forced exit(1) into exit(0).
  const finish = (code: number, message: string): void => {
    if (exited) return;
    exited = true;
    log(message);
    exit(code);
  };

  const shutdown = (signal: string): void => {
    if (started) return;
    started = true;
    log(`${signal} received; finishing in-flight requests`);

    const timer = setTimeout(() => {
      finish(1, `shutdown timed out after ${Math.round(timeoutMs / 1000)}s; exiting`);
    }, timeoutMs);
    // The deadline must not be the reason the process stays alive.
    timer.unref?.();

    close(() => {
      clearTimeout(timer);
      finish(0, 'closed');
    });
  };

  Object.defineProperty(shutdown, 'started', { get: () => started });
  return shutdown as Shutdown;
}
