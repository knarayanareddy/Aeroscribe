import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type AuditAction =
  | 'run.created'
  | 'run.advanced'
  | 'stage.blocked'
  | 'gate.approved'
  | 'gate.rejected'
  | 'evidence.appended'
  | 'registry.verified'
  | 'literature.searched'
  | 'doi.verified'
  | 'cfd.executed'
  | 'unauthorised';

export interface AuditEntry {
  at: string;
  action: AuditAction;
  runId: string | null;
  actor: string;
  detail?: Record<string, unknown>;
}

/**
 * Append-only audit trail (NDJSON).
 *
 * Every state change the API makes is written here before the response is
 * returned, so a reviewer can reconstruct who did what without trusting the
 * application. Audit writes never throw into the request path unless the file
 * itself is unwritable — in that case the caller should treat the operation as
 * failed, which `record()` enforces by propagating the error.
 */
export class AuditLog {
  private readonly path: string;
  private readonly clock: () => Date;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string, options: { clock?: () => Date } = {}) {
    this.path = path;
    this.clock = options.clock ?? (() => new Date());
  }

  record(entry: Omit<AuditEntry, 'at'>): Promise<void> {
    const line: AuditEntry = { at: this.clock().toISOString(), ...entry };
    const operation = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(line)}\n`, 'utf8');
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  /**
   * Read the trail back.
   *
   * The log is append-only, so the only failure mode worth reporting is a line
   * that does not parse (a truncated write after a crash). Such lines are
   * skipped and counted in `malformed` rather than throwing, because losing the
   * ability to read the audit trail is worse than one bad record.
   */
  async read(filter: { runId?: string; action?: AuditAction; limit?: number } = {}): Promise<{
    entries: AuditEntry[];
    malformed: number;
  }> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], malformed: 0 };
      throw error;
    }

    const entries: AuditEntry[] = [];
    let malformed = 0;

    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const parsed = JSON.parse(line) as AuditEntry;
        if (filter.runId !== undefined && parsed.runId !== filter.runId) continue;
        if (filter.action !== undefined && parsed.action !== filter.action) continue;
        entries.push(parsed);
      } catch {
        malformed += 1;
      }
    }

    const limited = filter.limit ? entries.slice(-filter.limit) : entries;
    return { entries: limited, malformed };
  }

  get filePath(): string {
    return this.path;
  }
}
