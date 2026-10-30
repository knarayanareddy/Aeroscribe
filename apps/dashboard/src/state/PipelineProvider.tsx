import type { PipelineRun } from '@aeroscribe/pipeline';
import { createInitialState, pipelineReducer } from '@aeroscribe/pipeline';
import { useMemo, useReducer, type ReactNode } from 'react';
import { mockPipelineRuns } from '../data/mockData';
import { PipelineContext } from './pipelineContext';

interface PipelineProviderProps {
  children: ReactNode;
  /** Override the fixture set (used by tests). */
  initialRuns?: PipelineRun[];
  initialRunId?: string;
}

export function PipelineProvider({
  children,
  initialRuns = mockPipelineRuns,
  initialRunId,
}: PipelineProviderProps) {
  const [state, dispatch] = useReducer(pipelineReducer, initialRuns, (runs) =>
    createInitialState(runs, initialRunId ?? runs[0]?.id ?? null),
  );

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}
