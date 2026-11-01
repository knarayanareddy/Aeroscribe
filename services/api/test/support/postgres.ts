import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { runMigrations } from '../../src/store/postgres/migrations';

/**
 * A real Postgres server for the tests.
 *
 * Two ways to get one, in order of preference:
 *
 * 1. `AEROSCRIBE_TEST_DATABASE_URL` — a server the environment already
 *    provides (a compose stack, a CI service container). Nothing is started or
 *    stopped, and the test only creates and drops its own databases.
 * 2. `embedded-postgres` — genuine Postgres binaries shipped as a package, run
 *    as an ordinary user in a temporary directory. No Docker, no root, no
 *    network. This is what makes the suite runnable on a laptop that has never
 *    installed a database.
 *
 * A test double is deliberately not an option: advisory locks, `jsonb`,
 * triggers and transaction isolation are the behaviour under test, and a fake
 * would prove only that the fake works.
 */

export interface PostgresFixture {
  /** Connection string for the maintenance database. */
  adminUrl: string;
  /** Create an empty database with the schema applied. */
  createDatabase(): Promise<string>;
  /** Drop a database created by `createDatabase`. */
  dropDatabase(name: string): Promise<void>;
  stop(): Promise<void>;
  /** `true` when the server is the embedded one (no external service). */
  embedded: boolean;
}

const DEFAULT_PORT = 55_432;

async function waitForServer(url: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Postgres did not answer on ${url} after ${attempts} attempts`);
}

export async function startPostgres(): Promise<PostgresFixture> {
  const external = process.env.AEROSCRIBE_TEST_DATABASE_URL;
  if (external !== undefined && external !== '') {
    return {
      adminUrl: external,
      embedded: false,
      createDatabase: () => createDatabase(external),
      dropDatabase: (name) => dropDatabase(external, name),
      stop: async () => undefined,
    };
  }

  const directory = await mkdtemp(join(tmpdir(), 'aeroscribe-postgres-'));
  const port = DEFAULT_PORT + Math.floor(Math.random() * 200);
  const server = new EmbeddedPostgres({
    databaseDir: directory,
    user: 'aeroscribe',
    password: 'aeroscribe',
    port,
    persistent: false,
  });

  await server.initialise();
  await server.start();

  const adminUrl = `postgres://aeroscribe:aeroscribe@127.0.0.1:${port}/postgres`;
  await waitForServer(adminUrl);

  return {
    adminUrl,
    embedded: true,
    createDatabase: () => createDatabase(adminUrl),
    dropDatabase: (name) => dropDatabase(adminUrl, name),
    stop: async () => {
      await server.stop().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function createDatabase(adminUrl: string): Promise<string> {
  const name = `aeroscribe_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }

  return url.toString();
}

async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    // A pooled connection keeps the database busy; terminate it first so the
    // drop is not blocked by a test that finished a moment ago.
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  } finally {
    await admin.end();
  }
}

/** The database name inside a URL, for `dropDatabase`. */
export function databaseNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}
