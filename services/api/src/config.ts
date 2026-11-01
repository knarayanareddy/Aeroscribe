import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseLogLevel, type LogLevel } from './lib/logger';
import { redactDatabaseUrl, type StoreBackend } from './store';
import { redactRedisUrl, type CoordinationBackend } from './coord';
import type { AuthMode, AuthSettings } from './auth';

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
  /**
   * Where the rate limit and the stage lock live (`AEROSCRIBE_COORDINATION`).
   * `process` is a correct answer for one instance and a lie for two; it is
   * reported by `/health` so a reader can tell which they have.
   */
  coordination: CoordinationBackend;
  /**
   * `AEROSCRIBE_REDIS_URL`, required by `coordination: redis`. Never returned
   * to a client: capabilities expose `redactRedisUrl()` instead.
   */
  redisUrl: string | null;
  /**
   * How callers are authenticated (`AEROSCRIBE_AUTH`).
   *
   * Optional in the type so a hand-built test config does not have to describe
   * a deployment it is not testing: `authSettings()` derives the same answer
   * from `apiKey` alone, which is exactly what every caller had before accounts
   * existed. `loadConfig` always sets it.
   */
  auth?: AuthSettings;
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
 * Where shared coordination state lives.
 *
 * Unknown values are a configuration error, for the same reason an unknown
 * store is: a process that was told to share its counters and quietly kept
 * them local would enforce 60 requests per instance and look healthy doing it.
 */
function parseCoordination(env: NodeJS.ProcessEnv): CoordinationBackend {
  const raw = envString(env, 'AEROSCRIBE_COORDINATION').toLowerCase();
  if (raw === '' || raw === 'process') return 'process';
  if (raw === 'redis') return 'redis';
  throw new Error(
    `AEROSCRIBE_COORDINATION="${raw}" is not a supported coordinator. Supported: process, redis.`,
  );
}

/**
 * Which authentication mode this deployment runs, from `AEROSCRIBE_AUTH`.
 *
 * Unset is derived from what is present: an API key means `token`, no key means
 * `none` — the behaviour every existing deployment already had. Setting the
 * variable makes the choice explicit, and an explicit choice that contradicts
 * the rest of the environment is refused at boot rather than reconciled:
 *
 * - `oidc` without an issuer or an audience is a half-configured login screen;
 * - `token` without a key would authenticate nobody;
 * - `none` **with** a key set is the dangerous one. A key the API ignores looks
 *   like an enforced credential in every runbook that mentions it, which is
 *   worse than having no key at all.
 *
 * `oidc` and `AEROSCRIBE_API_KEY` together are refused for the same reason: a
 * shared key that skips role checks makes the roles decorative.
 */
function parseAuth(env: NodeJS.ProcessEnv): AuthSettings {
  const raw = envString(env, 'AEROSCRIBE_AUTH').toLowerCase();
  const apiKey = envString(env, 'AEROSCRIBE_API_KEY');

  if (raw !== '' && raw !== 'none' && raw !== 'token' && raw !== 'oidc') {
    throw new Error(
      `AEROSCRIBE_AUTH="${raw}" is not a supported mode. Supported: none, token, oidc.`,
    );
  }
  const mode: AuthMode = raw === '' ? (apiKey === '' ? 'none' : 'token') : (raw as AuthMode);

  if (mode === 'none' && apiKey !== '') {
    throw new Error(
      'AEROSCRIBE_API_KEY is set but AEROSCRIBE_AUTH=none. Unset the key, or set ' +
        'AEROSCRIBE_AUTH=token — a key the API ignores is a credential every runbook believes in.',
    );
  }
  if (mode === 'token' && apiKey === '') {
    throw new Error(
      'AEROSCRIBE_AUTH=token requires AEROSCRIBE_API_KEY (generate one with: openssl rand -hex 32).',
    );
  }

  const adminSubs = envString(env, 'AEROSCRIBE_ADMIN_SUBS')
    .split(',')
    .map((sub) => sub.trim())
    .filter((sub) => sub.length > 0);

  if (mode !== 'oidc') {
    if (adminSubs.length > 0) {
      throw new Error(
        'AEROSCRIBE_ADMIN_SUBS is set but nobody is authenticated: it only means something with ' +
          'AEROSCRIBE_AUTH=oidc, where a subject can be promoted.',
      );
    }
    return { mode, apiKey, oidc: null, adminSubs: [] };
  }

  if (apiKey !== '') {
    throw new Error(
      'AEROSCRIBE_AUTH=oidc cannot be combined with AEROSCRIBE_API_KEY. A shared key that ' +
        'bypasses roles makes the roles decorative; scripts should present an access token ' +
        '(set AEROSCRIBE_API_KEY in the *client* to that token — the deploy smoke test already ' +
        'sends whatever it is given as a bearer token).',
    );
  }

  const issuer = envString(env, 'OIDC_ISSUER');
  const audience = envString(env, 'OIDC_AUDIENCE');
  if (issuer === '') {
    throw new Error(
      'AEROSCRIBE_AUTH=oidc requires OIDC_ISSUER (e.g. https://login.example.org/realms/aeroscribe).',
    );
  }
  if (audience === '') {
    throw new Error(
      'AEROSCRIBE_AUTH=oidc requires OIDC_AUDIENCE: the `aud` every access token must carry.',
    );
  }
  try {
    const parsed = new URL(issuer);
    if (
      parsed.protocol !== 'https:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      throw new Error('not https');
    }
  } catch {
    // A plain-HTTP issuer is a token in clear text and a JWKS anyone can spoof.
    // Loopback is exempt so a local IdP can be tested.
    throw new Error(
      `OIDC_ISSUER="${issuer}" must be an https URL (loopback is allowed for a local issuer).`,
    );
  }

  const scopes = envString(env, 'OIDC_SCOPES', 'openid profile email')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  return {
    mode,
    apiKey: '',
    adminSubs,
    oidc: {
      issuer: issuer.replace(/\/$/, ''),
      audience,
      // The dashboard is a public client; its id is not a secret and is served
      // to the browser by `/api/v1/auth/config`.
      clientId: envString(env, 'OIDC_CLIENT_ID', audience),
      scopes,
      clockSkewSeconds: envInt(env, 'OIDC_CLOCK_SKEW_SECONDS', 60),
    },
  };
}

/**
 * The effective auth settings for a config object.
 *
 * `loadConfig` always fills `config.auth`; a hand-built config in a test may
 * not, and then this derives the same answer from `apiKey` alone — the exact
 * behaviour that config would have had before accounts existed.
 */
export function authSettings(config: Config): AuthSettings {
  return (
    config.auth ?? {
      mode: config.apiKey === '' ? 'none' : 'token',
      apiKey: config.apiKey,
      oidc: null,
      adminSubs: [],
    }
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

  const coordination = parseCoordination(env);
  const redisUrl = envString(env, 'AEROSCRIBE_REDIS_URL') || null;

  // The same contract, for the same reason. A half-configured coordinator is
  // worse than no coordinator: two instances would enforce their own limits
  // and each would report a healthy `/health`.
  if (coordination === 'redis' && redisUrl === null) {
    throw new Error(
      'AEROSCRIBE_COORDINATION=redis requires AEROSCRIBE_REDIS_URL (redis://host:6379/0).',
    );
  }
  if (coordination === 'process' && redisUrl !== null) {
    throw new Error(
      'AEROSCRIBE_REDIS_URL is set but AEROSCRIBE_COORDINATION is process. ' +
        'Set AEROSCRIBE_COORDINATION=redis to share rate limits and the stage lock, ' +
        'or unset the URL — counting locally while a Redis is configured is how two ' +
        'instances each get their own 60 requests a minute.',
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
    coordination,
    redisUrl,
    auth: parseAuth(env),
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
  const auth = authSettings(config);
  const authMode = auth.mode;
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
    auth: {
      // `required` keeps its old meaning — a credential is needed — and `mode`
      // says which kind, so a client cannot mistake a shared key for identities.
      required: authMode !== 'none',
      mode: authMode,
      issuer: auth?.oidc?.issuer ?? null,
    },
    storage: {
      backend: config.store,
      // Kept for the filesystem adapter and for a reader comparing two
      // deployments; empty when the documents live in a database instead.
      runsDir: config.store === 'filesystem' ? `${config.dataDir}/runs` : '',
      auditPath: config.store === 'filesystem' ? `${config.dataDir}/audit.ndjson` : '',
      database: config.databaseUrl === null ? null : redactDatabaseUrl(config.databaseUrl),
      // Artefact bytes are content-addressed files under the data directory in
      // every mode; a record's digest is checkable only against something that
      // is actually stored.
      blobsDir: `${config.dataDir}/blobs`,
    },
    coordination: {
      backend: config.coordination,
      redis: config.redisUrl === null ? null : redactRedisUrl(config.redisUrl),
    },
  };
}
