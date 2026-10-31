import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { describeCapabilities, loadConfig } from './config';
import { createApp } from './http/app';
import { Orchestrator } from './orchestrator';
import {
  ArxivClient,
  CrossrefClient,
  LiteratureService,
  SemanticScholarClient,
} from './literature';
import { CfdService } from './cfd';
import { AuditLog } from './store/audit';
import { EvidenceRegistry } from './store/registry';
import { RunRepository } from './store/runs';
import { detectSu2 } from './config';
import { createLogger } from './lib/logger';
import { createShutdown } from './lib/shutdown';

/**
 * Process entry point.
 *
 * Reads configuration, wires the services, and serves the API. The only side
 * effects are creating the data directory on first write and binding a port.
 */
export async function buildServer(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const su2 = await detectSu2(config.su2Binary);

  const registry = new EvidenceRegistry(join(config.dataDir, 'registry.ndjson'));
  const runs = new RunRepository(join(config.dataDir, 'runs'));
  const audit = new AuditLog(join(config.dataDir, 'audit.ndjson'));

  const literature = new LiteratureService({
    offline: config.offline,
    // One slow provider must not hold the whole stage: the deadline is the
    // operator's, not the client library's.
    providerTimeoutMs: config.upstreamTimeoutMs,
    providers: [
      new CrossrefClient({
        contactEmail: config.contactEmail,
        baseDelayMs: config.retryBaseDelayMs,
        timeoutMs: config.upstreamTimeoutMs,
      }),
      new ArxivClient({
        baseDelayMs: config.retryBaseDelayMs,
        timeoutMs: config.upstreamTimeoutMs,
      }),
      new SemanticScholarClient({
        apiKey: env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined,
        baseDelayMs: config.retryBaseDelayMs,
        timeoutMs: config.upstreamTimeoutMs,
      }),
    ],
  });

  const cfd = new CfdService({ su2, workDir: join(config.dataDir, 'cfd') });

  // The API key and the Semantic Scholar key are declared secret here, so a
  // message that interpolates one is masked even under an innocent field name.
  const logger = createLogger({
    level: config.logLevel,
    secrets: [config.apiKey, env.SEMANTIC_SCHOLAR_API_KEY ?? ''].filter(
      (secret) => secret.length > 0,
    ),
  });

  const orchestrator = new Orchestrator({ runs, registry, audit, literature, cfd, logger });

  const app = createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    logger,
  });

  return { app, config, orchestrator, logger };
}

const isMain = process.argv[1]?.endsWith('index.ts') ?? false;

export interface StartServerOptions {
  /** Injected in tests; the real default binds a TCP port. */
  serve?: typeof serve;
  log?: (message: string) => void;
  /** Where the process exits to. Injected so tests do not kill the runner. */
  exit?: (code: number) => void;
}

/**
 * Binds the port and installs the shutdown handlers.
 *
 * Separate from `buildServer` so a test can prove what production wiring does —
 * which address it binds, what it prints, and that SIGTERM closes the listener —
 * without opening a socket or signalling the test runner.
 */
export function startServer(
  { app, config, logger }: Awaited<ReturnType<typeof buildServer>>,
  {
    serve: serveFn = serve,
    // RULE-053 bans `console.log` in production code: the lifecycle lines go
    // through the same JSON logger as everything else, so `docker logs | jq`
    // sees one stream rather than two formats interleaved.
    log = (message: string) => logger.info('server.lifecycle', { message }),
    exit = (code) => process.exit(code),
  }: StartServerOptions = {},
) {
  const server = serveFn({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    log(`listening on http://${info.address}:${info.port}`);
    log(
      `auth: ${config.apiKey ? 'API key required' : 'disabled (set AEROSCRIBE_API_KEY before exposing this)'}`,
    );
    log(
      `literature: ${config.offline ? 'offline corpus' : 'live providers'} · data: ${config.dataDir}`,
    );
  });

  // `docker stop` sends SIGTERM. Stop accepting requests and let the ones in
  // flight finish their writes: a killed stage leaves a run that still says
  // "running" and no evidence record for the work it had already done.
  const shutdown = createShutdown({
    close: (onClosed) => server.close(onClosed),
    exit,
    log: (message) => log(`[api] ${message}`),
  });
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return { server, shutdown };
}

if (isMain) {
  startServer(await buildServer());
}

export * from './orchestrator';
export * from './config';
export * from './store/registry';
export * from './literature';
export * from './cfd';
export * from './claims/verify';
