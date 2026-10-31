import type { AuditResponse, Capabilities, EvidenceRecord } from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PipelineContext, type LoadStatus } from './pipelineContext';
import { createFixtureSource } from './fixtureSource';
import type { RunSource } from './source';

interface PipelineProviderProps {
  children: ReactNode;
  /**
   * Where runs come from. Defaults to the fixture source, so a test or the
   * fixture build never touches the network.
   */
  source?: RunSource;
  /** Override the fixture seed (used by tests). */
  initialRuns?: PipelineRun[];
  initialRunId?: string;
}

/**
 * Loads runs from a source and holds everything the views read.
 *
 * Two rules the previous version could not state:
 *
 * - **A failure is shown, not swallowed.** `status: 'error'` keeps the server's
 *   message and the run list stays whatever was last loaded — it never falls
 *   back to fixtures, because a dashboard that silently shows demo data when
 *   the API is down is worse than one that shows nothing.
 * - **Mutations are explicit.** `advance`, `approveGate` and `createRun` are
 *   async and re-read the run afterwards, so what the UI shows is what the
 *   server actually recorded.
 */
export function PipelineProvider({
  children,
  source,
  initialRuns,
  initialRunId,
}: PipelineProviderProps) {
  const runSource = useMemo<RunSource>(
    () => source ?? createFixtureSource(initialRuns),
    [source, initialRuns],
  );

  const [runs, setRuns] = useState<PipelineRun[]>(() => runSource.initialRuns ?? []);
  const [activeRunId, setActiveRunId] = useState<string | null>(
    () => initialRunId ?? runSource.initialRuns?.[0]?.id ?? null,
  );
  const [status, setStatus] = useState<LoadStatus>(() =>
    runSource.initialRuns ? 'ready' : 'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [audit, setAudit] = useState<AuditResponse | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [loaded, caps] = await Promise.all([
        runSource.listRuns(),
        runSource.capabilities().catch(() => null),
      ]);
      if (!mounted.current) return;
      setRuns(loaded);
      setCapabilities(caps);
      setStatus('ready');
      setError(null);
      setActiveRunId((current) => {
        if (current && loaded.some((run) => run.id === current)) return current;
        return loaded[0]?.id ?? null;
      });
    } catch (caught) {
      if (!mounted.current) return;
      setStatus('error');
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [runSource]);

  useEffect(() => {
    // The fixture source seeded state synchronously; nothing to fetch.
    if (runSource.initialRuns) return;
    // Deferred by a microtask: the effect must not synchronously write state
    // (that is what causes a render cascade), and the load is async anyway.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load();
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [load, runSource]);

  // Evidence and the audit trail belong to the selected run, so they are
  // refetched when it changes rather than polled. Fixtures have no evidence
  // records at all, so that path never fetches and never writes state.
  const selected = activeRunId;
  const isFixtureSource = runSource.mode === 'fixtures';
  useEffect(() => {
    if (isFixtureSource || !selected) return;
    let cancelled = false;
    void (async () => {
      try {
        const [records, trail] = await Promise.all([
          runSource.evidence(selected),
          runSource.audit().catch(() => null),
        ]);
        if (cancelled) return;
        setEvidence(records);
        setAudit(trail);
      } catch (caught) {
        if (cancelled) return;
        // Evidence failing does not invalidate the run list; keep the run
        // visible and let the view show the reason it has no records.
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFixtureSource, runSource, selected]);

  /** Apply a mutation, then re-read so the UI reflects the server's state. */
  const mutate = useCallback(
    async <T,>(action: () => Promise<T>, selectedId?: string): Promise<T> => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        const [loaded, records] = await Promise.all([
          runSource.listRuns(),
          selectedId ? runSource.evidence(selectedId).catch(() => evidence) : Promise.resolve(null),
        ]);
        if (mounted.current) {
          setRuns(loaded);
          if (records) setEvidence(records);
          setStatus('ready');
        }
        return result;
      } catch (caught) {
        if (mounted.current) {
          setStatus('error');
          setError(caught instanceof Error ? caught.message : String(caught));
        }
        throw caught;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [evidence, runSource],
  );

  const value = useMemo(() => {
    const activeRun =
      runs.find((run) => run.id === activeRunId) ?? (activeRunId === null ? undefined : runs[0]);

    return {
      runs,
      activeRunId: activeRun?.id ?? null,
      activeRun,
      status,
      error,
      mode: runSource.mode,
      sourceLabel: runSource.label,
      capabilities,
      evidence,
      audit,
      busy,

      selectRun: (runId: string) => setActiveRunId(runId),
      refresh: load,

      createRun: async (input: { topic: string; journal?: string }) => {
        const run = await mutate(() => runSource.createRun(input));
        setActiveRunId(run.id);
        return run;
      },

      advance: async (runId: string) => {
        await mutate(() => runSource.advance(runId), runId);
      },

      approveGate: async (runId: string, gateId: string) => {
        await mutate(() => runSource.approveGate(runId, gateId, 'dashboard'), runId);
      },

      requestRevision: async (runId: string, gateId: string, note?: string) => {
        await mutate(() => runSource.requestRevision(runId, gateId, 'dashboard', note), runId);
      },
    };
  }, [
    runs,
    activeRunId,
    status,
    error,
    runSource,
    capabilities,
    evidence,
    audit,
    busy,
    load,
    mutate,
  ]);

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}
