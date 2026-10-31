import type { Capabilities, EvidenceRecord } from '@aeroscribe/contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DataModeBadge from '../components/DataModeBadge';
import { createFixtureSource } from './fixtureSource';
import { PipelineProvider } from './PipelineProvider';
import { usePipeline } from './pipelineContext';
import type { RunSource } from './source';

/** A source that fails every call, the way an unreachable API does. */
function failingSource(): RunSource {
  const fail = async (): Promise<never> => {
    throw new Error('Failed to fetch');
  };
  return {
    mode: 'live',
    label: 'Live API · http://api.test',
    listRuns: fail,
    getRun: fail,
    createRun: fail,
    advance: fail,
    approveGate: fail,
    requestRevision: fail,
    evidence: fail,
    capabilities: fail,
    audit: fail,
  };
}

function source(overrides: Partial<RunSource> = {}): RunSource {
  return {
    mode: 'live',
    label: 'Live API · http://api.test',
    listRuns: async () => [],
    getRun: async () => {
      throw new Error('not used');
    },
    createRun: async () => {
      throw new Error('not used');
    },
    advance: async () => ({ run: {} as never, evidenceSeq: null, blocked: null }),
    approveGate: async () => ({}) as never,
    requestRevision: async () => ({}) as never,
    evidence: async (): Promise<EvidenceRecord[]> => [],
    capabilities: async (): Promise<Capabilities | null> => null,
    audit: async () => null,
    ...overrides,
  };
}

function Probe() {
  const { status, error, runs, mode, evidence } = usePipeline();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="error">{error ?? 'none'}</p>
      <p data-testid="mode">{mode}</p>
      <p data-testid="runs">{runs.length}</p>
      <p data-testid="evidence">{evidence.length}</p>
    </div>
  );
}

describe('PipelineProvider', () => {
  it('seeds fixtures synchronously so the first render is complete', () => {
    render(
      <PipelineProvider source={createFixtureSource()}>
        <Probe />
      </PipelineProvider>,
    );

    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(Number(screen.getByTestId('runs').textContent)).toBeGreaterThan(0);
    expect(screen.getByTestId('mode')).toHaveTextContent('fixtures');
  });

  it('shows the API failure and keeps zero runs — it never falls back to fixtures', async () => {
    render(
      <PipelineProvider source={failingSource()}>
        <Probe />
        <DataModeBadge />
      </PipelineProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch');
    // The critical assertion: an unreachable API must not turn into demo data.
    expect(screen.getByTestId('runs')).toHaveTextContent('0');
    expect(screen.getByTestId('mode')).toHaveTextContent('live');
    expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('API unreachable');
    expect(screen.queryByText(/illustrative data/i)).not.toBeInTheDocument();
  });

  it('retries on explicit action and recovers', async () => {
    let attempt = 0;
    const flaky = source({
      listRuns: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('Failed to fetch');
        return [];
      },
    });

    render(
      <PipelineProvider source={flaky}>
        <Probe />
        <DataModeBadge />
      </PipelineProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('loads evidence for the selected run only', async () => {
    const evidence = vi.fn(async (): Promise<EvidenceRecord[]> => []);
    render(
      <PipelineProvider source={source({ evidence })}>
        <Probe />
      </PipelineProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // No runs exist, so there is no run to fetch evidence for.
    expect(evidence).not.toHaveBeenCalled();
  });

  it('keeps the server error message when a mutation fails', async () => {
    const advance = vi.fn(async () => {
      throw new Error('Stage 0 is waiting for GATE-0.');
    });

    function Trigger() {
      const { advance: runStage } = usePipeline();
      return (
        <button type="button" onClick={() => void runStage('run-1').catch(() => undefined)}>
          advance
        </button>
      );
    }

    render(
      <PipelineProvider source={source({ advance })}>
        <Probe />
        <Trigger />
      </PipelineProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    await userEvent.click(screen.getByRole('button', { name: 'advance' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Stage 0 is waiting for GATE-0.'),
    );
  });
});

describe('fixture source', () => {
  it('approves the pending gate and moves to the next stage', async () => {
    const fixtures = createFixtureSource();
    const [first] = await fixtures.listRuns();
    const pending = first!.stages.find((stage) => stage.status === 'gate_pending');
    expect(pending).toBeDefined();

    const updated = await fixtures.approveGate(first!.id, pending!.gateId ?? 'GATE-0');
    expect(updated.stages[pending!.id]!.status).toBe('completed');
  });

  it('cannot run a stage, and does not pretend to', async () => {
    const fixtures = createFixtureSource();
    const [first] = await fixtures.listRuns();
    const result = await fixtures.advance(first!.id);
    expect(result.evidenceSeq).toBeNull();
    expect(result.blocked).toBeNull();
    expect(result.run.id).toBe(first!.id);
  });

  it('reports no capabilities and no evidence rather than inventing them', async () => {
    const fixtures = createFixtureSource();
    await expect(fixtures.capabilities()).resolves.toBeNull();
    await expect(fixtures.evidence('run-001')).resolves.toEqual([]);
  });
});
