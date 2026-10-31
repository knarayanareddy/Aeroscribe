import type { AuditResponse, Capabilities, EvidenceRecord } from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';

/**
 * One interface, two implementations.
 *
 * The views do not know whether they are looking at fixtures or at a live API;
 * they know what data they have and what it means. That is deliberate: the
 * fixture path is the regression test for the live path, and a view that can
 * only work with one of them is a view that lies about the other.
 */

export interface AdvanceResult {
  run: PipelineRun;
  /** Null when the stage was blocked and wrote no evidence. */
  evidenceSeq: number | null;
  blocked: { reason: string } | null;
}

export interface RunSource {
  readonly mode: 'fixtures' | 'live';
  /** Human-readable origin, shown in the data-mode badge. */
  readonly label: string;
  /**
   * Present only for sources that can answer synchronously. The fixture source
   * does, so the existing tests keep their synchronous first render; the API
   * source cannot, so the UI shows a loading state instead of empty tables.
   */
  readonly initialRuns?: PipelineRun[];

  listRuns(): Promise<PipelineRun[]>;
  getRun(id: string): Promise<PipelineRun>;
  createRun(input: { topic: string; journal?: string }): Promise<PipelineRun>;
  advance(id: string): Promise<AdvanceResult>;
  approveGate(id: string, gateId: string, actor?: string): Promise<PipelineRun>;
  requestRevision(id: string, gateId: string, actor?: string, note?: string): Promise<PipelineRun>;
  evidence(id: string): Promise<EvidenceRecord[]>;
  capabilities(): Promise<Capabilities | null>;
  audit(): Promise<AuditResponse | null>;
}
