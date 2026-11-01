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
import { createStores } from './store';
import { detectSu2, detectLatex } from './config';
import { LatexService } from './latex';
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

  // One factory decides which adapter the process uses; every caller below sees
  // the ports, never a concrete class (ROADMAP § 8, D1).
  const stores = createStores({
    dataDir: config.dataDir,
    store: config.store,
    databaseUrl: config.databaseUrl,
  });

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
  // The TeX engine is probed once, like SU2: availability is a fact about this
  // process, and a toolchain installed later is picked up on restart.
  const latex = new LatexService({
    latex: await detectLatex(config.latexBinary),
    workDir: join(config.dataDir, 'manuscripts'),
    timeoutMs: config.latexTimeoutMs,
  });

  // The API key and the Semantic Scholar key are declared secret here, so a
  // message that interpolates one is masked even under an innocent field name.
  const logger = createLogger({
    level: config.logLevel,
    secrets: [config.apiKey, env.SEMANTIC_SCHOLAR_API_KEY ?? ''].filter(
      (secret) => secret.length > 0,
    ),
  });

  const orchestrator = new Orchestrator({
    runs: stores.runs,
    registry: stores.evidence,
    audit: stores.audit,
    literature,
    cfd,
    latex,
    logger,
    doiMaxAgeDays: config.doiMaxAgeDays,
  });

  const app = createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    stores,
    logger,
  });

  return { app, config, orchestrator, logger, stores };
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
  { app, config, logger, stores }: Awaited<ReturnType<typeof buildServer>>,
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
      `literature: ${config.offline ? 'offline corpus' : 'live providers'} · ` +
        `store: ${config.store}${config.store === 'filesystem' ? ` (${config.dataDir})` : ''}`,
    );
  });

  // `docker stop` sends SIGTERM. Stop accepting requests and let the ones in
  // flight finish their writes: a killed stage leaves a run that still says
  // "running" and no evidence record for the work it had already done.
  const shutdown = createShutdown({
    // Drain the pool after the listener closes: a `pg` client released mid-query
    // would leave a transaction to be rolled back by the server's own timeout
    // instead of by us.
    close: (onClosed) =>
      server.close(() => {
        const draining = stores.close?.();
        // The filesystem adapter holds nothing, so its shutdown stays
        // synchronous; a pool is drained before the process is allowed to go.
        if (draining === undefined) {
          onClosed();
          return;
        }
        void Promise.resolve(draining)
          .catch(() => undefined)
          .finally(onClosed);
      }),
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
export * from './store';
export * from './literature';
export * from './cfd';
export * from './claims/verify';
