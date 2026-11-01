import type { Pool } from 'pg';
import type { Role, UserRecord, UserStore, UpsertUserInput } from '../ports';
import { storeError } from './client';

interface UserRow {
  sub: string;
  email: string | null;
  name: string | null;
  role: Role;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: UserRow): UserRecord {
  return {
    sub: row.sub,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Accounts in Postgres.
 *
 * `upsertOnLogin` is a single statement with `ON CONFLICT`, not a read followed
 * by a write: two instances serving the same person's first two requests would
 * otherwise both decide the row is missing and one of them would fail on the
 * primary key, turning a login into a `500`.
 *
 * The conflict clause updates the display fields and *not* the role. A login can
 * never change what somebody is allowed to do — that is the whole point of the
 * role living in a table an admin writes and a login only reads.
 */
export class PostgresUserStore implements UserStore {
  constructor(
    private readonly pool: Pool,
    private readonly databaseUrl: string,
  ) {}

  private fail(error: unknown): never {
    throw storeError(error, this.databaseUrl);
  }

  async get(sub: string): Promise<UserRecord | null> {
    try {
      const result = await this.pool.query<UserRow>(
        'SELECT sub, email, name, role, created_at, updated_at FROM users WHERE sub = $1',
        [sub],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    } catch (error) {
      this.fail(error);
    }
  }

  async list(): Promise<UserRecord[]> {
    try {
      const result = await this.pool.query<UserRow>(
        'SELECT sub, email, name, role, created_at, updated_at FROM users ORDER BY created_at, sub',
      );
      return result.rows.map(toRecord);
    } catch (error) {
      this.fail(error);
    }
  }

  async upsertOnLogin(input: UpsertUserInput): Promise<UserRecord> {
    const now = (input.now ?? new Date()).toISOString();
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (sub, email, name, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (sub) DO UPDATE SET
           email = COALESCE(EXCLUDED.email, users.email),
           name = COALESCE(EXCLUDED.name, users.name),
           -- Promotion only, and only from a deployment that names the subject
           -- as an admin. Demotion is an explicit admin action (setRole).
           role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE users.role END,
           updated_at = CASE
             WHEN EXCLUDED.role = 'admin' AND users.role <> 'admin' THEN EXCLUDED.updated_at
             WHEN COALESCE(EXCLUDED.email, users.email) IS DISTINCT FROM users.email THEN EXCLUDED.updated_at
             WHEN COALESCE(EXCLUDED.name, users.name) IS DISTINCT FROM users.name THEN EXCLUDED.updated_at
             ELSE users.updated_at
           END
         RETURNING sub, email, name, role, created_at, updated_at`,
        [input.sub, input.email ?? null, input.name ?? null, input.role, now],
      );
      return toRecord(result.rows[0]!);
    } catch (error) {
      this.fail(error);
    }
  }

  async setRole(sub: string, role: Role, now: Date = new Date()): Promise<UserRecord> {
    try {
      const result = await this.pool.query<UserRow>(
        `UPDATE users SET role = $2, updated_at = $3
         WHERE sub = $1
         RETURNING sub, email, name, role, created_at, updated_at`,
        [sub, role, now.toISOString()],
      );
      const row = result.rows[0];
      if (!row) throw new Error(`No user with sub "${sub}".`);
      return toRecord(row);
    } catch (error) {
      this.fail(error);
    }
  }
}
