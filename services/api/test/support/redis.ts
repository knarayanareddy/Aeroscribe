import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import IORedis from 'ioredis';

/**
 * A real Redis for the tests.
 *
 * Three ways to get one, in order of preference:
 *
 * 1. `AEROSCRIBE_TEST_REDIS_URL` — a server the environment already provides
 *    (a compose stack, the CI service container). Nothing is started or stopped.
 * 2. `AEROSCRIBE_REDIS_SERVER` — a path to a `redis-server` binary to start in a
 *    temporary directory on a free port.
 * 3. `redis-server` on `PATH` — the same, found the usual way.
 *
 * With none of those the suite **skips with a reason** rather than pretending:
 * a double would prove only that the double works, and the two behaviours under
 * test — a counter shared between instances and a lock one instance cannot
 * take from another — are exactly what a double cannot have.
 *
 * Every fixture reserves its own key prefix, so a shared server (or two test
 * files in parallel) cannot make one suite's counters another's.
 */

export interface RedisFixture {
  url: string;
  /** Unique per fixture: keys are namespaced under it. */
  keyPrefix: string;
  stop(): Promise<void>;
}

export type RedisAvailability = { available: true } | { available: false; reason: string };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        if (port > 0) resolve(port);
        else reject(new Error('could not reserve a port'));
      });
    });
  });
}

function binaryPath(): string | null {
  const configured = process.env.AEROSCRIBE_REDIS_SERVER;
  if (configured !== undefined && configured.trim() !== '') return configured.trim();

  const probe = spawnSync('redis-server', ['--version'], { encoding: 'utf8' });
  return probe.status === 0 ? 'redis-server' : null;
}

/**
 * Wait for a real PONG.
 *
 * `connect()` is not enough: with a retry strategy that gives up, ioredis can
 * settle the promise without a connection, which is how the first version of
 * this helper "succeeded" against a server that was still starting. The `ready`
 * event only fires once a socket is up and the handshake finished.
 */
async function waitForServer(url: string, timeoutMs = 10_000): Promise<void> {
  const client = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 50, 200),
  });
  client.on('error', () => undefined);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`redis did not answer on ${url}`)),
        timeoutMs,
      );
      timer.unref?.();
      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
      client.connect().catch(() => undefined);
    });
    await client.ping();
  } finally {
    client.disconnect();
  }
}

export function redisAvailability(): RedisAvailability {
  const external = process.env.AEROSCRIBE_TEST_REDIS_URL;
  if (external !== undefined && external.trim() !== '') return { available: true };
  if (binaryPath() !== null) return { available: true };
  return {
    available: false,
    reason:
      'no Redis to test against: set AEROSCRIBE_TEST_REDIS_URL to a running server, ' +
      'AEROSCRIBE_REDIS_SERVER to a redis-server binary, or install redis-server. ' +
      'CI runs these tests against a redis:7 service container.',
  };
}

export async function startRedis(): Promise<RedisFixture> {
  const external = process.env.AEROSCRIBE_TEST_REDIS_URL;
  if (external !== undefined && external.trim() !== '') {
    const url = external.trim();
    await waitForServer(url);
    return {
      url,
      keyPrefix: `aeroscribe:test:${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      stop: async () => undefined,
    };
  }

  const binary = binaryPath();
  if (binary === null) {
    const availability = redisAvailability();
    throw new Error(availability.available ? 'no redis' : availability.reason);
  }

  const directory = await mkdtemp(join(tmpdir(), 'aeroscribe-redis-'));
  const port = await freePort();
  const child: ChildProcess = spawn(
    binary,
    [
      '--port',
      String(port),
      '--bind',
      '127.0.0.1',
      // No persistence: this server exists for one test file.
      '--save',
      '',
      '--appendonly',
      'no',
      '--dir',
      directory,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // Keep the first lines of stderr so a failed start names its reason instead
  // of leaving a bare timeout.
  let diagnostics = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics += chunk.toString();
    if (diagnostics.length > 4_000) diagnostics = diagnostics.slice(-4_000);
  });

  const url = `redis://127.0.0.1:${port}/0`;
  try {
    await waitForServer(url);
  } catch (error) {
    child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
    throw new Error(
      `${(error as Error).message}${diagnostics.trim() === '' ? '' : `\nredis-server said: ${diagnostics.trim()}`}`,
    );
  }

  return {
    url,
    keyPrefix: `aeroscribe:test:${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        setTimeout(resolve, 2_000).unref?.();
      });
      await rm(directory, { recursive: true, force: true });
    },
  };
}
