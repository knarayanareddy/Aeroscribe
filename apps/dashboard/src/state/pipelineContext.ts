import type { PipelineAction, PipelineRun, PipelineState } from '@aeroscribe/pipeline';
import { createContext, useContext, type Dispatch } from 'react';

export interface PipelineContextValue {
  state: PipelineState;
  dispatch: Dispatch<PipelineAction>;
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
  const { state } = usePipeline();
  return state.runs.find((run) => run.id === state.activeRunId) ?? state.runs[0];
}
