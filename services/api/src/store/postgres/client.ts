import pg from 'pg';
import { StoreUnavailableError } from '../../errors';

/**
 * The connection pool, and the one place `pg` errors are classified.
 *
 * Two kinds of failure reach an adapter and they must not be conflated:
 *
 * - **The database is not there** (refused, timed out, shut down mid-query).
 *   That is a `503`: retry later, nothing the client did is wrong. It must not
 *   be reported as a `500`, and it must not be swallowed into an empty result —
 *   an empty evidence list would look like a run with no records.
 * - **The database said no** (a constraint violation, a missing migration).
 *   That is a bug or a misconfiguration, and it must stay loud.
 *
 * Everything else is rethrown untouched, so an unexpected failure is still an
 * unexpected failure rather than a tidy `503`.
 */

/** Connection-level SQLSTATE classes and libpq codes. */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EPIPE',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '53300', // too_many_connections
]);

export interface PostgresOptions {
  /** `AEROSCRIBE_DATABASE_URL`. Never logged, never returned by the API. */
  databaseUrl: string;
  /** Pool size. The API is I/O-bound; ten connections beats one. */
  max?: number;
}

/**
 * Strip the password from a connection string.
 *
 * `postgres://user:pw@host:5432/db` appears in `/health`, capabilities and log
 * lines, and a password in any of those is a leak. Only scheme, user, host,
 * port and database survive.
 */
export function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const user = url.username === '' ? '' : `${url.username}@`;
    const database = url.pathname === '' ? '' : url.pathname;
    return `${url.protocol}//${user}${url.host}${database}`;
  } catch {
    // An unparseable URL is itself a configuration problem; do not echo it.
    return 'the configured database URL (unparseable)';
  }
}

export function isUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') {
    // A pool that never got a socket reports a plain Error with this message.
    return /ECONNREFUSED|ENOTFOUND|timeout exceeded when trying to connect/i.test(
      (error as Error).message ?? '',
    );
  }
  return UNAVAILABLE_CODES.has(code);
}

/** Wrap a connection failure as a `503`; leave everything else alone. */
export function storeError(error: unknown, databaseUrl: string): unknown {
  if (error instanceof StoreUnavailableError) return error;
  if (!isUnavailable(error)) return error;
  return new StoreUnavailableError(
    'postgres',
    `cannot reach ${redactDatabaseUrl(databaseUrl)} (${(error as Error).message})`,
  );
}

export function createPool({ databaseUrl, max = 10 }: PostgresOptions): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    // A hung connect must fail fast: `/health` polls this every 30 s, and a
    // request should not wait for the kernel's TCP timeout to learn the answer.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  // A server that restarts or drops a connection emits `error` on the idle
  // client. Node treats an unhandled `error` event as a fatal exception, so
  // without this listener a database restart would kill the API process — the
  // opposite of the resilience a pooled connection is for. The failure is not
  // swallowed: the next query on that pool fails and every adapter turns that
  // into a `503` with the reason attached.
  pool.on('error', () => undefined);

  return pool;
}

/** True when `error` is a unique violation (`SQLSTATE 23505`). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown }).code === '23505';
}
