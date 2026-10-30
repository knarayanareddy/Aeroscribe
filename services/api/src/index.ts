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

  const orchestrator = new Orchestrator({ runs, registry, audit, literature, cfd });

  const app = createApp({
    orchestrator,
    config,
    capabilities: () => describeCapabilities(config),
    enableLogging: true,
  });

  return { app, config, orchestrator };
}

const isMain = process.argv[1]?.endsWith('index.ts') ?? false;

if (isMain) {
  const { app, config } = await buildServer();

  serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    console.log(`[api] listening on http://${info.address}:${info.port}`);
    console.log(
      `[api] auth: ${config.apiKey ? 'API key required' : 'disabled (set AEROSCRIBE_API_KEY before exposing this)'}`,
    );
    console.log(
      `[api] literature: ${config.offline ? 'offline corpus' : 'live providers'} · data: ${config.dataDir}`,
    );
  });
}

export * from './orchestrator';
export * from './config';
export * from './store/registry';
export * from './literature';
export * from './cfd';
export * from './claims/verify';
