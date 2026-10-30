import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockPipelineRuns } from '../data/mockData';
import { PipelineProvider } from '../state/PipelineProvider';
import PipelineView from './PipelineView';

function renderView() {
  return render(
    <PipelineProvider>
      <PipelineView onNavigate={vi.fn()} />
    </PipelineProvider>,
  );
}

describe('PipelineView gate handling', () => {
  it('closes the gate and starts the next stage without mutating the fixture data', async () => {
    const user = userEvent.setup();
    const snapshot = structuredClone(mockPipelineRuns);
    const gateStageIndex = 2;

    renderView();

    // run-001 is seeded with GATE-2 open.
    expect(screen.getByText(/Gate: GATE-2/)).toBeInTheDocument();

    // The gate stage is expanded by default because it is the run's current stage.
    await user.click(screen.getByRole('button', { name: /Approve & continue/i }));

    // The badge disappears because the stage is now completed…
    expect(screen.queryByText(/Gate: GATE-2/)).not.toBeInTheDocument();
    // …but the imported fixture is untouched.
    expect(mockPipelineRuns).toEqual(snapshot);
    expect(mockPipelineRuns[0]?.stages[gateStageIndex]?.status).toBe('gate_pending');
  });

  it('records a revision request instead of approving', async () => {
    const user = userEvent.setup();

    renderView();

    await user.click(screen.getByRole('button', { name: /Send back for revision/i }));

    expect(screen.getByText('revision 1')).toBeInTheDocument();
    // The stage goes back to running and must pass the gate again on the next pass.
    expect(screen.queryByText(/Gate: GATE-2/)).not.toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('creates a run from the form and selects it', async () => {
    const user = userEvent.setup();

    renderView();

    await user.click(screen.getByRole('button', { name: /New pipeline run/i }));
    await user.type(
      screen.getByLabelText(/Research topic/i),
      'Adaptive wing morphing for transonic drag reduction',
    );
    await user.click(screen.getByRole('button', { name: /Launch pipeline/i }));

    expect(screen.getByRole('heading', { name: /Adaptive wing morphing/ })).toBeInTheDocument();
    expect(screen.getByText('Runs (4)')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('rejects a topic that is too short', async () => {
    const user = userEvent.setup();

    renderView();

    await user.click(screen.getByRole('button', { name: /New pipeline run/i }));
    await user.type(screen.getByLabelText(/Research topic/i), 'short');
    await user.click(screen.getByRole('button', { name: /Launch pipeline/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);
  });
});
