import type { AuditResponse, Capabilities, EvidenceRecord } from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { createContext, useContext } from 'react';
import type { RunSource } from './source';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface PipelineContextValue {
  /** Every run the source can see. */
  runs: PipelineRun[];
  activeRunId: string | null;
  activeRun: PipelineRun | undefined;
  status: LoadStatus;
  /** The server's message, verbatim. Never replaced with a generic one. */
  error: string | null;
  mode: RunSource['mode'];
  sourceLabel: string;
  /** How to reach a rendered manuscript file, when the source can serve one. */
  artefactUrl: RunSource['artefactUrl'];

  capabilities: Capabilities | null;
  evidence: EvidenceRecord[];
  audit: AuditResponse | null;
  /** True while a mutation (advance, approve, create) is in flight. */
  busy: boolean;

  selectRun(runId: string): void;
  refresh(): Promise<void>;
  createRun(input: { topic: string; journal?: string }): Promise<PipelineRun>;
  advance(runId: string): Promise<void>;
  approveGate(runId: string, gateId: string): Promise<void>;
  requestRevision(runId: string, gateId: string, note?: string): Promise<void>;
}

export const PipelineContext = createContext<PipelineContextValue | null>(null);

export function usePipeline(): PipelineContextValue {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipeline must be used inside a <PipelineProvider>');
  }
  return context;
}

export function useActiveRun(): PipelineRun | undefined {
  return usePipeline().activeRun;
}

/** Evidence for the active run, newest last. Empty in fixture mode, by design. */
export function useEvidence(): EvidenceRecord[] {
  return usePipeline().evidence;
}
