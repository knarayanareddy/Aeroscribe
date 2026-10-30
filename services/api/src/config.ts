import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

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
  corsOrigins: string[];
  /** Slowest an upstream call may be before it is aborted. */
  upstreamTimeoutMs: number;
  /** Base delay for exponential backoff (RULE-042 wants 2s; tests use ~1ms). */
  retryBaseDelayMs: number;
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
 * Read configuration from the environment.
 *
 * Nothing here invents a default secret: if `AEROSCRIBE_API_KEY` is unset the
 * API runs unauthenticated and `/health` reports that, which is the honest
 * state for a local development server and a dangerous one for a deployment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: envString(env, 'HOST', '127.0.0.1'),
    port: envInt(env, 'PORT', 8787),
    dataDir: resolve(envString(env, 'AEROSCRIBE_DATA_DIR', './data')),
    apiKey: envString(env, 'AEROSCRIBE_API_KEY'),
    contactEmail: envString(env, 'AEROSCRIBE_CONTACT_EMAIL'),
    offline: envBool(env, 'AEROSCRIBE_OFFLINE', false),
    su2Binary: envString(env, 'SU2_CFD_BINARY') || null,
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
  };
}

export interface Su2Capability {
  configured: boolean;
  binary: string | null;
  /** True only when the binary is configured *and* executable on this machine. */
  available: boolean;
}

export interface Capabilities {
  literature: {
    mode: 'live' | 'offline';
    crossref: boolean;
    arxiv: boolean;
    semanticScholar: boolean;
  };
  cfd: {
    su2: Su2Capability;
    /** Deterministic placeholder physics, always available, always labelled. */
    synthetic: boolean;
  };
  registry: { algorithm: 'sha256'; path: string };
  auth: { required: boolean };
  storage: { runsDir: string; auditPath: string };
}

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

export async function describeCapabilities(config: Config): Promise<Capabilities> {
  const su2 = await detectSu2(config.su2Binary);
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
    registry: { algorithm: 'sha256', path: `${config.dataDir}/registry.ndjson` },
    auth: { required: config.apiKey !== '' },
    storage: {
      runsDir: `${config.dataDir}/runs`,
      auditPath: `${config.dataDir}/audit.ndjson`,
    },
  };
}
