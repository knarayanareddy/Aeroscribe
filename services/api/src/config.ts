import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseLogLevel, type LogLevel } from './lib/logger';
import { redactDatabaseUrl, type StoreBackend } from './store';

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  /** Bearer token required on every API call. Empty means auth is disabled. */
  apiKey: string;
  /** Contact address sent to Crossref/OpenAlex polite pools. */
  contactEmail: string;
  /** When true, providers never touch the network and use the offline corpus. */
  offline: boolean;
  /** Absolute path to the SU2_CFD binary, when the operator configured one. */
  su2Binary: string | null;
  /** Absolute path to a TeX engine (`pdflatex`), when one is configured. */
  latexBinary: string | null;
  /** Wall-clock limit for one engine pass. */
  latexTimeoutMs: number;
  corsOrigins: string[];
  /** Slowest an upstream call may be before it is aborted. */
  upstreamTimeoutMs: number;
  /** Base delay for exponential backoff (RULE-042 wants 2s; tests use ~1ms). */
  retryBaseDelayMs: number;
  /**
   * How old a manuscript's generation-time DOI verification may be before a
   * re-check reports it `stale` and stage 8 asks for a re-check. Reported, not
   * enforced: nothing deletes a reference because it aged.
   */
  doiMaxAgeDays: number;
  /**
   * Which storage adapter the process uses (`AEROSCRIBE_STORE`). Only
   * `filesystem` exists today; the option is read and validated now so that a
   * typo fails at boot instead of being ignored.
   */
  store: StoreBackend;
  /**
   * `AEROSCRIBE_DATABASE_URL`, required by the `postgres` adapter. Never
   * returned to a client: capabilities expose `redactDatabaseUrl()` instead.
   */
  databaseUrl: string | null;
  /** Verbosity of the JSON log stream (RULE-053). */
  logLevel: LogLevel;
  /** Release identifier reported by `/health`; the build sets it. */
  version: string;
  /** Commit the running image was built from, or `unknown`. */
  commit: string;
}

function envString(env: NodeJS.ProcessEnv, key: string, fallback = ''): string {
  const value = env[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = envString(env, key);
  if (raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = envString(env, key).toLowerCase();
  if (raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * Which store backend to use.
 *
 * An unknown value is a configuration error, not a reason to fall back to the
 * filesystem: a process told to use Postgres that silently writes JSON files
 * instead is the exact failure mode ROADMAP section 8 exists to prevent.
 */
function parseStore(env: NodeJS.ProcessEnv): StoreBackend {
  const raw = envString(env, 'AEROSCRIBE_STORE').toLowerCase();
  if (raw === '' || raw === 'filesystem') return 'filesystem';
  if (raw === 'postgres') return 'postgres';
  throw new Error(
    `AEROSCRIBE_STORE="${raw}" is not a supported store. Supported: filesystem, postgres.`,
  );
}

/**
 * Read configuration from the environment.
 *
 * Nothing here invents a default secret: if `AEROSCRIBE_API_KEY` is unset the
 * API runs unauthenticated and `/health` reports that, which is the honest
 * state for a local development server and a dangerous one for a deployment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const store = parseStore(env);
  const databaseUrl = envString(env, 'AEROSCRIBE_DATABASE_URL') || null;

  // Refuse an unusable combination at boot rather than at the first write. A
  // process told to use Postgres that starts without a URL and then answers
  // every request with a `500` is worse than one that never started.
  if (store === 'postgres' && databaseUrl === null) {
    throw new Error(
      'AEROSCRIBE_STORE=postgres requires AEROSCRIBE_DATABASE_URL (postgres://user:password@host:5432/database).',
    );
  }
  if (store === 'filesystem' && databaseUrl !== null) {
    throw new Error(
      'AEROSCRIBE_DATABASE_URL is set but AEROSCRIBE_STORE is filesystem. ' +
        'Set AEROSCRIBE_STORE=postgres to use the database, or unset the URL — ' +
        'silently writing files while a database is configured is how two sources of truth start.',
    );
  }

  return {
    host: envString(env, 'HOST', '127.0.0.1'),
    port: envInt(env, 'PORT', 8787),
    dataDir: resolve(envString(env, 'AEROSCRIBE_DATA_DIR', './data')),
    apiKey: envString(env, 'AEROSCRIBE_API_KEY'),
    contactEmail: envString(env, 'AEROSCRIBE_CONTACT_EMAIL'),
    offline: envBool(env, 'AEROSCRIBE_OFFLINE', false),
    su2Binary: envString(env, 'SU2_CFD_BINARY') || null,
    latexBinary: envString(env, 'LATEX_BINARY') || null,
    latexTimeoutMs: envInt(env, 'LATEX_TIMEOUT_MS', 120_000),
    corsOrigins: envString(
      env,
      'AEROSCRIBE_CORS_ORIGINS',
      'http://localhost:5173,http://localhost:5174',
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    upstreamTimeoutMs: envInt(env, 'AEROSCRIBE_UPSTREAM_TIMEOUT_MS', 15_000),
    retryBaseDelayMs: envInt(env, 'AEROSCRIBE_RETRY_BASE_MS', 2_000),
    doiMaxAgeDays: envInt(env, 'AEROSCRIBE_DOI_MAX_AGE_DAYS', 30),
    store,
    databaseUrl,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    version: envString(env, 'AEROSCRIBE_VERSION', 'dev'),
    commit: envString(env, 'GIT_SHA', 'unknown'),
  };
}

// The capabilities shape is the wire contract: the dashboard renders every
// boolean in it, so it is defined once and consumed on both sides.
export type { Capabilities, LatexCapability, Su2Capability } from '@aeroscribe/contract';
import type { Capabilities, LatexCapability, Su2Capability } from '@aeroscribe/contract';
import { probeLatex } from './latex/toolchain';

/** Probe the machine for optional external tools. Never throws. */
export async function detectSu2(binary: string | null): Promise<Su2Capability> {
  if (!binary) return { configured: false, binary: null, available: false };
  try {
    await access(binary);
    return { configured: true, binary, available: true };
  } catch {
    return { configured: true, binary, available: false };
  }
}

/**
 * Probe TeX at most once per configured path.
 *
 * `/health` runs on every container probe, and spawning a process per probe
 * would be a self-inflicted load test. The trade-off is documented: a toolchain
 * installed after the process started is picked up on restart, exactly as with
 * `SU2_CFD_BINARY`.
 */
const latexProbes = new Map<string, Promise<LatexCapability>>();

export function detectLatex(binary: string | null): Promise<LatexCapability> {
  const key = binary ?? '';
  let probe = latexProbes.get(key);
  if (!probe) {
    probe = probeLatex(binary);
    latexProbes.set(key, probe);
  }
  return probe;
}

export async function describeCapabilities(config: Config): Promise<Capabilities> {
  const [su2, latex] = await Promise.all([
    detectSu2(config.su2Binary),
    detectLatex(config.latexBinary),
  ]);
  return {
    literature: {
      mode: config.offline ? 'offline' : 'live',
      // Crossref and arXiv need no credentials. Semantic Scholar works without a
      // key at a lower rate limit, so all three are "available" unless offline.
      crossref: !config.offline,
      arxiv: !config.offline,
      semanticScholar: !config.offline,
    },
    cfd: { su2, synthetic: true },
    latex,
    registry: { algorithm: 'sha256', path: `${config.dataDir}/registry.ndjson` },
    auth: { required: config.apiKey !== '' },
    storage: {
      backend: config.store,
      // Kept for the filesystem adapter and for a reader comparing two
      // deployments; empty when the documents live in a database instead.
      runsDir: config.store === 'filesystem' ? `${config.dataDir}/runs` : '',
      auditPath: config.store === 'filesystem' ? `${config.dataDir}/audit.ndjson` : '',
      database: config.databaseUrl === null ? null : redactDatabaseUrl(config.databaseUrl),
    },
  };
}
