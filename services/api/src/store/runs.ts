import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { readJson, writeJsonAtomic } from '../lib/atomic';

/**
 * Pipeline runs persisted as one JSON document each.
 *
 * Writes are atomic (temp file + rename), so a crash mid-write leaves the
 * previous version intact rather than a truncated file. The directory is the
 * source of truth; there is no in-process cache to invalidate.
 */
export class RunRepository {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  get path(): string {
    return this.directory;
  }

  private file(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error(`Unsafe run id: ${runId}`);
    }
    return join(this.directory, `${runId}.json`);
  }

  async save(run: PipelineRun): Promise<PipelineRun> {
    await writeJsonAtomic(this.file(run.id), run);
    return run;
  }

  async get(runId: string): Promise<PipelineRun | null> {
    return readJson<PipelineRun>(this.file(runId));
  }

  async list(): Promise<PipelineRun[]> {
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const runs = await Promise.all(
      entries
        // Options sidecars are also .json; they are not runs and sorting them
        // as runs used to throw on the missing `createdAt`.
        .filter((entry) => entry.endsWith('.json') && !entry.endsWith('.options.json'))
        .map((entry) => readJson<PipelineRun>(join(this.directory, entry))),
    );

    // Newest first. Two runs created in the same millisecond tie on createdAt,
    // and directory order is not a contract, so the id breaks the tie: the list
    // must not depend on which order the filesystem happens to return.
    return runs
      .filter((run): run is PipelineRun => run !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async remove(runId: string): Promise<void> {
    await rm(this.file(runId), { force: true });
    await rm(this.optionsFile(runId), { force: true });
  }

  private optionsFile(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error(`Unsafe run id: ${runId}`);
    }
    return join(this.directory, `${runId}.options.json`);
  }

  /** Run-specific knobs are persisted next to the run so a restart keeps them. */
  async saveOptions(runId: string, options: unknown): Promise<void> {
    await writeJsonAtomic(this.optionsFile(runId), options);
  }

  async getOptions<T>(runId: string): Promise<T | null> {
    return readJson<T>(this.optionsFile(runId));
  }
}
