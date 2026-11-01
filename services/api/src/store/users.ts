import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Role, UserRecord, UserStore, UpsertUserInput } from './ports';

/**
 * Users, on disk, as an append-only log.
 *
 * A role change is a new line rather than an edit, for the same reason the audit
 * trail is append-only: "who was an admin on the 3rd" is a question this file
 * can answer and a `users` row cannot. Reads fold the log — last line per `sub`
 * wins — so the file grows with role changes, not with requests.
 *
 * `upsertOnLogin` rewrites `email`/`name` (they change when a person changes
 * their name or their IdP does) but never rewrites `role`: roles only move when
 * an admin moves them, or when the deployment's admin list promotes someone.
 */
export class FilesystemUserStore implements UserStore {
  private readonly path: string;
  private readonly clock: () => Date;
  /** Serialises appends within this process, like the audit store. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string, options: { clock?: () => Date } = {}) {
    this.path = path;
    this.clock = options.clock ?? (() => new Date());
  }

  private async readAll(): Promise<UserRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const bySub = new Map<string, UserRecord>();
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // A truncated final line after a crash. Skipping it is the same choice
        // the audit store makes, and for the same reason: one unreadable line
        // must not make every user unreadable.
        continue;
      }
      const record = asUserRecord(parsed);
      if (record) bySub.set(record.sub, record);
    }
    return Array.from(bySub.values());
  }

  private append(record: UserRecord): Promise<void> {
    const operation = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8');
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async get(sub: string): Promise<UserRecord | null> {
    return (await this.readAll()).find((user) => user.sub === sub) ?? null;
  }

  async list(): Promise<UserRecord[]> {
    // Oldest first, the sub breaking a shared timestamp — the same order the
    // Postgres adapter returns, because the port is the contract and an operator
    // reading two deployments should not see two orderings.
    return (await this.readAll()).sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.sub.localeCompare(right.sub),
    );
  }

  async upsertOnLogin(input: UpsertUserInput): Promise<UserRecord> {
    const now = (input.now ?? this.clock()).toISOString();
    const existing = await this.get(input.sub);

    if (existing === null) {
      const record: UserRecord = {
        sub: input.sub,
        email: input.email ?? null,
        name: input.name ?? null,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      };
      await this.append(record);
      return record;
    }

    const promoted = input.role === 'admin' && existing.role !== 'admin';
    const changed =
      promoted ||
      (input.email ?? null) !== existing.email ||
      (input.name ?? null) !== existing.name;
    if (!changed) return existing;

    const record: UserRecord = {
      ...existing,
      email: input.email ?? existing.email,
      name: input.name ?? existing.name,
      role: promoted ? 'admin' : existing.role,
      updatedAt: now,
    };
    await this.append(record);
    return record;
  }

  async setRole(sub: string, role: Role, now: Date = this.clock()): Promise<UserRecord> {
    const existing = await this.get(sub);
    if (existing === null) throw new Error(`No user with sub "${sub}".`);
    if (existing.role === role) return existing;

    const record: UserRecord = { ...existing, role, updatedAt: now.toISOString() };
    await this.append(record);
    return record;
  }
}

/** Validate a parsed line before trusting it as a user record. */
export function asUserRecord(value: unknown): UserRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const role = record.role;
  if (typeof record.sub !== 'string' || record.sub === '') return null;
  if (role !== 'researcher' && role !== 'reviewer' && role !== 'admin') return null;
  return {
    sub: record.sub,
    email: typeof record.email === 'string' ? record.email : null,
    name: typeof record.name === 'string' ? record.name : null,
    role,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
  };
}
