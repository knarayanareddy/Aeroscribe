import type {
  AuditAction,
  AuditEntry,
  EvidenceKind,
  EvidenceRecord,
  RegistryVerification,
} from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';

/**
 * Ports for the three things the API persists.
 *
 * These interfaces are the seam ROADMAP section 8 was written around: the
 * filesystem adapters in this directory implement them today, and a database
 * adapter implements the same three without the orchestrator or the HTTP layer
 * noticing. Nothing here mentions files, paths or SQL on purpose — a port that
 * names its storage is not a port.
 *
 * A note on what a port cannot promise. `EvidenceStore.append` is atomic with
 * respect to *one* store instance for the filesystem adapter, because a JSON
 * file cannot be locked between processes. An adapter backed by a database is
 * expected to serialise appends across processes. Callers therefore must not
 * assume multi-writer safety; they get what the configured backend offers, and
 * `/health` reports which backend that is.
 */

/** Storage the API can be configured to use. Grows as adapters land. */
export type StoreBackend = 'filesystem' | 'postgres';

/** What the configured backend supports, so a client cannot assume the rest. */
export interface StoreProbe {
  backend: StoreBackend;
  /** False means the backing store cannot be reached or written right now. */
  ok: boolean;
  /** One sentence for `/health`: what was probed and what came back. */
  detail: string;
}

/** One append to the evidence registry, before it is hashed and chained. */
export interface AppendEvidenceInput {
  kind: EvidenceKind;
  runId: string;
  stageId?: number | null;
  label: string;
  payload: unknown;
  /** Overrides the clock; used by tests to make chains reproducible. */
  createdAt?: string;
}

export interface EvidenceQuery {
  runId?: string;
  kind?: EvidenceKind;
}

export interface AuditQuery {
  runId?: string;
  action?: AuditAction;
  limit?: number;
}

/**
 * Append-only, hash-chained evidence trail.
 *
 * Every method is `async` even where the filesystem adapter could answer from
 * memory: a database adapter cannot, and a port whose shape changes when the
 * second adapter arrives is not a port.
 */
export interface EvidenceStore {
  /** Append one record and return it exactly as it was chained. */
  append(input: AppendEvidenceInput): Promise<EvidenceRecord>;
  list(query?: EvidenceQuery): Promise<EvidenceRecord[]>;
  get(seq: number): Promise<EvidenceRecord | null>;
  /** Newest record of a kind for a run, e.g. the latest manuscript. */
  latest(runId: string, kind: EvidenceKind): Promise<EvidenceRecord | null>;
  /**
   * Recompute the chain from the backing store and report the first
   * inconsistency. Verification must not trust any cache the adapter keeps.
   */
  verify(): Promise<RegistryVerification>;
}

/** Pipeline runs and their per-run options. */
export interface RunStore {
  save(run: PipelineRun): Promise<PipelineRun>;
  get(runId: string): Promise<PipelineRun | null>;
  /** Newest first. Two runs created in the same millisecond tie on id. */
  list(): Promise<PipelineRun[]>;
  remove(runId: string): Promise<void>;
  saveOptions(runId: string, options: unknown): Promise<void>;
  getOptions<T>(runId: string): Promise<T | null>;
}

/** Who did what, with a timestamp, appended before the response is returned. */
export interface AuditStore {
  record(entry: Omit<AuditEntry, 'at'>): Promise<void>;
  read(query?: AuditQuery): Promise<{ entries: AuditEntry[]; malformed: number }>;
}

/**
 * A person, as the API knows them.
 *
 * `sub` is the OIDC subject: the issuer's immutable identifier for an account,
 * and the only thing authorization keys on. An email address can be reassigned;
 * a subject cannot.
 */
export type Role = 'researcher' | 'reviewer' | 'admin';

export const ROLES: readonly Role[] = ['researcher', 'reviewer', 'admin'];

export interface UserRecord {
  sub: string;
  email: string | null;
  name: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertUserInput {
  sub: string;
  email?: string | null;
  name?: string | null;
  /**
   * The role to grant a subject seen for the first time — and the only way this
   * method can raise an existing role, which it does only to `admin` and only
   * because a deployment listed the subject in `AEROSCRIBE_ADMIN_SUBS`.
   */
  role: Role;
  now?: Date;
}

/**
 * Accounts. Keyed by OIDC subject, never by email.
 *
 * `upsertOnLogin` is deliberately not called `create`: a person appears the
 * first time their token verifies, with the least role that can do anything
 * useful (`researcher`), and an admin promotes them from there.
 */
export interface UserStore {
  get(sub: string): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
  upsertOnLogin(input: UpsertUserInput): Promise<UserRecord>;
  /** Throws when the subject is unknown: an empty role would be a default. */
  setRole(sub: string, role: Role, now?: Date): Promise<UserRecord>;
}

/** The stores plus the facts `/health` needs about them. */
export interface Stores {
  backend: StoreBackend;
  runs: RunStore;
  evidence: EvidenceStore;
  audit: AuditStore;
  /** Accounts. Empty in `none`/`token` mode, which have no principals. */
  users: UserStore;
  /** Cheap liveness check; a database adapter pings the database here. */
  probe(): Promise<StoreProbe>;
  /**
   * Release whatever the adapter holds (a connection pool, a file handle).
   * The filesystem adapter holds nothing and omits it; a caller that owns the
   * process lifetime should await it on shutdown.
   */
  close?(): Promise<void>;
}
