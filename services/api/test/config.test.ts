// @vitest-environment node
import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeCapabilities, detectSu2, loadConfig } from '../src/config';
import type { serve } from '@hono/node-server';
import { buildServer, startServer } from '../src/index';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-config-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('uses safe defaults when the environment is empty', () => {
    const config = loadConfig({});

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8787);
    expect(config.apiKey).toBe('');
    expect(config.contactEmail).toBe('');
    expect(config.offline).toBe(false);
    expect(config.su2Binary).toBeNull();
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:5174']);
    expect(config.upstreamTimeoutMs).toBe(15_000);
    expect(config.retryBaseDelayMs).toBe(2_000);
    expect(config.logLevel).toBe('info');
    expect(config.version).toBe('dev');
    expect(config.commit).toBe('unknown');
    expect(isAbsolute(config.dataDir)).toBe(true);
    expect(config.store).toBe('filesystem');
  });

  it('refuses a store backend it cannot implement', () => {
    // A typo must stop the process, not quietly leave it on the filesystem.
    expect(() => loadConfig({ AEROSCRIBE_STORE: 'postgres' })).toThrow(/AEROSCRIBE_STORE/);
    expect(() => loadConfig({ AEROSCRIBE_STORE: 'postgres' })).toThrow(/filesystem/);
    expect(loadConfig({ AEROSCRIBE_STORE: ' Filesystem ' }).store).toBe('filesystem');
  });

  it('reads LOG_LEVEL leniently and ignores an unknown one', () => {
    expect(loadConfig({ LOG_LEVEL: ' warn ' }).logLevel).toBe('warn');
    expect(loadConfig({ LOG_LEVEL: 'chatty' }).logLevel).toBe('info');
    expect(loadConfig({ LOG_LEVEL: 'silent' }).logLevel).toBe('silent');
  });

  it('reads and trims every value it understands', () => {
    const config = loadConfig({
      HOST: '  0.0.0.0  ',
      PORT: '9090',
      AEROSCRIBE_DATA_DIR: directory,
      AEROSCRIBE_API_KEY: '  secret  ',
      AEROSCRIBE_CONTACT_EMAIL: ' ops@example.org ',
      AEROSCRIBE_OFFLINE: 'yes',
      SU2_CFD_BINARY: '/opt/su2/bin/SU2_CFD',
      AEROSCRIBE_CORS_ORIGINS: ' https://one.example , , https://two.example ',
      AEROSCRIBE_UPSTREAM_TIMEOUT_MS: '2500',
      AEROSCRIBE_RETRY_BASE_MS: '250',
      LOG_LEVEL: 'debug',
      AEROSCRIBE_VERSION: ' 1.2.3 ',
      GIT_SHA: 'abc1234',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(9090);
    expect(config.dataDir).toBe(directory);
    expect(config.apiKey).toBe('secret');
    expect(config.contactEmail).toBe('ops@example.org');
    expect(config.offline).toBe(true);
    expect(config.su2Binary).toBe('/opt/su2/bin/SU2_CFD');
    expect(config.corsOrigins).toEqual(['https://one.example', 'https://two.example']);
    expect(config.upstreamTimeoutMs).toBe(2500);
    expect(config.retryBaseDelayMs).toBe(250);
    expect(config.logLevel).toBe('debug');
    expect(config.version).toBe('1.2.3');
    expect(config.commit).toBe('abc1234');
  });

  it('never invents a secret', () => {
    // An unset key means authentication is off, which is a deliberate and
    // visible state - not a silent default password.
    expect(loadConfig({ AEROSCRIBE_API_KEY: '   ' }).apiKey).toBe('');
    expect(loadConfig({}).apiKey).toBe('');
  });

  it('falls back on a non-numeric port instead of listening on NaN', () => {
    expect(loadConfig({ PORT: 'http' }).port).toBe(8787);
    expect(loadConfig({ PORT: '0' }).port).toBe(8787);
    expect(loadConfig({ PORT: '-1' }).port).toBe(8787);
    expect(loadConfig({ PORT: '65535' }).port).toBe(65_535);
  });

  it('treats only explicit truths as true', () => {
    for (const value of ['1', 'true', 'YES', 'on', ' True ']) {
      expect(loadConfig({ AEROSCRIBE_OFFLINE: value }).offline, value).toBe(true);
    }
    for (const value of ['0', 'false', 'no', 'off', 'maybe', '']) {
      expect(loadConfig({ AEROSCRIBE_OFFLINE: value }).offline, value).toBe(false);
    }
  });

  it('resolves a relative data directory against the working directory', () => {
    const config = loadConfig({ AEROSCRIBE_DATA_DIR: './var/data' });
    expect(isAbsolute(config.dataDir)).toBe(true);
    expect(config.dataDir.endsWith(join('var', 'data'))).toBe(true);
  });
});

describe('detectSu2', () => {
  it('reports nothing configured when no binary is set', async () => {
    await expect(detectSu2(null)).resolves.toEqual({
      configured: false,
      binary: null,
      available: false,
    });
  });

  it('reports a configured binary as available', async () => {
    const binary = join(directory, 'SU2_CFD');
    await writeFile(binary, '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(binary, 0o755);

    await expect(detectSu2(binary)).resolves.toEqual({
      configured: true,
      binary,
      available: true,
    });
  });

  it('distinguishes "configured but missing" from "not configured"', async () => {
    // The difference matters: one is a typo in a deployment, the other is a
    // deliberate choice not to run a solver.
    await expect(detectSu2(join(directory, 'nope'))).resolves.toEqual({
      configured: true,
      binary: join(directory, 'nope'),
      available: false,
    });
  });
});

describe('describeCapabilities', () => {
  it('describes an offline server with no solver and no auth', async () => {
    const capabilities = await describeCapabilities(
      loadConfig({ AEROSCRIBE_DATA_DIR: directory, AEROSCRIBE_OFFLINE: 'true' }),
    );

    expect(capabilities.literature).toEqual({
      mode: 'offline',
      crossref: false,
      arxiv: false,
      semanticScholar: false,
    });
    expect(capabilities.cfd.su2.available).toBe(false);
    expect(capabilities.cfd.synthetic).toBe(true);
    expect(capabilities.auth.required).toBe(false);
    expect(capabilities.registry.algorithm).toBe('sha256');
    expect(capabilities.storage.runsDir).toContain('runs');
  });

  it('reports live providers and required auth when configured', async () => {
    const capabilities = await describeCapabilities(
      loadConfig({ AEROSCRIBE_DATA_DIR: directory, AEROSCRIBE_API_KEY: 'k' }),
    );

    expect(capabilities.literature).toEqual({
      mode: 'live',
      crossref: true,
      arxiv: true,
      semanticScholar: true,
    });
    expect(capabilities.auth.required).toBe(true);
  });

  it('never includes the API key in its output', async () => {
    const capabilities = await describeCapabilities(
      loadConfig({ AEROSCRIBE_API_KEY: 'super-secret', AEROSCRIBE_DATA_DIR: directory }),
    );
    expect(JSON.stringify(capabilities)).not.toContain('super-secret');
  });
});

describe('buildServer', () => {
  it('wires a working app over the configured data directory', async () => {
    const { app, config, orchestrator } = await buildServer({
      AEROSCRIBE_DATA_DIR: directory,
      AEROSCRIBE_OFFLINE: 'true',
      LOG_LEVEL: 'silent',
    });

    expect(config.dataDir).toBe(directory);
    expect(orchestrator).toBeDefined();

    const health = await app.request('/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', authRequired: false });
  });

  it('persists created runs and evidence under the data directory', async () => {
    const { app } = await buildServer({
      AEROSCRIBE_DATA_DIR: directory,
      AEROSCRIBE_OFFLINE: 'true',
      LOG_LEVEL: 'silent',
    });

    const created = await app.request('/api/v1/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'transonic wing drag prediction', options: { paperLimit: 2 } }),
    });
    expect(created.status).toBe(201);
    const { run } = (await created.json()) as { run: { id: string } };

    await app.request(`/api/v1/runs/${run.id}/advance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor: 'ana' }),
    });

    expect((await readdir(join(directory, 'runs'))).sort()).toEqual([
      `${run.id}.json`,
      `${run.id}.options.json`,
    ]);
    expect((await readdir(directory)).sort()).toContain('registry.ndjson');
    expect((await readdir(directory)).sort()).toContain('audit.ndjson');

    const verify = await app.request('/api/v1/evidence/verify');
    expect(await verify.json()).toMatchObject({ valid: true, records: 1 });
  });

  it('enforces the API key it was configured with', async () => {
    const { app } = await buildServer({
      AEROSCRIBE_DATA_DIR: directory,
      AEROSCRIBE_API_KEY: 'k3y',
      AEROSCRIBE_OFFLINE: 'true',
      LOG_LEVEL: 'silent',
    });

    expect((await app.request('/api/v1/runs')).status).toBe(401);
    expect(
      (await app.request('/api/v1/runs', { headers: { authorization: 'Bearer k3y' } })).status,
    ).toBe(200);
    // The probe stays open so a load balancer can ask without credentials.
    expect((await app.request('/health')).status).toBe(200);
  });

  it('uses a configured SU2 binary when it exists', async () => {
    const binary = join(directory, 'SU2_CFD');
    await writeFile(binary, '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(binary, 0o755);

    const { app } = await buildServer({
      AEROSCRIBE_DATA_DIR: directory,
      AEROSCRIBE_OFFLINE: 'true',
      LOG_LEVEL: 'silent',
      SU2_CFD_BINARY: binary,
    });

    const capabilities = (await (await app.request('/health')).json()) as {
      capabilities: { cfd: { su2: { configured: boolean; available: boolean } } };
    };
    expect(capabilities.capabilities.cfd.su2).toMatchObject({ configured: true, available: true });
  });
});

describe('startServer (production wiring)', () => {
  it('binds the configured address, prints the mode, and closes on SIGTERM', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aeroscribe-start-'));
    const built = await buildServer({
      AEROSCRIBE_DATA_DIR: directory,
      HOST: '0.0.0.0',
      PORT: '8899',
      AEROSCRIBE_OFFLINE: 'true',
      LOG_LEVEL: 'silent',
      AEROSCRIBE_API_KEY: 'secret',
    } as NodeJS.ProcessEnv);

    const bound: Array<{ hostname: string; port: number }> = [];
    const logs: string[] = [];
    const exits: number[] = [];
    let onListen: ((info: { address: string; port: number }) => void) | undefined;
    let closed = false;

    const fakeServe = ((options: { hostname: string; port: number; fetch: unknown }, listener) => {
      expect(typeof options.fetch).toBe('function');
      bound.push({ hostname: options.hostname, port: options.port });
      onListen = listener;
      return {
        close: (cb?: () => void) => {
          closed = true;
          cb?.();
        },
      };
    }) as unknown as typeof serve;

    const handlers = new Map<string, () => void>();
    const once = vi.spyOn(process, 'once').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers.set(event, handler);
      return process;
    }) as typeof process.once);

    try {
      const started = startServer(built, {
        serve: fakeServe,
        log: (message) => logs.push(message),
        exit: (code) => exits.push(code),
      });

      onListen?.({ address: '0.0.0.0', port: 8899 });
      expect(bound).toEqual([{ hostname: '0.0.0.0', port: 8899 }]);
      expect(logs[0]).toBe('listening on http://0.0.0.0:8899');
      expect(logs[1]).toMatch(/API key required/);
      expect(logs[2]).toMatch(/offline corpus/);

      // The signal the container sends on `docker stop`.
      handlers.get('SIGTERM')?.();
      expect(closed).toBe(true);
      expect(exits).toEqual([0]);
      expect(started.shutdown.started).toBe(true);
      expect(handlers.has('SIGINT')).toBe(true);
    } finally {
      once.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
