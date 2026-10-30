import type { PipelineRun } from '@aeroscribe/pipeline';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PipelineProvider } from '../state/PipelineProvider';
import Dashboard from './Dashboard';

const shortRun: PipelineRun = {
  id: 'run-short',
  topic: 'Ion thruster plume modelling',
  journal: 'Journal of Propulsion and Power',
  status: 'running',
  createdAt: '2026-04-29T09:00:00Z',
  updatedAt: '2026-04-29T09:30:00Z',
  currentStage: 1,
  noveltyScore: 0,
  paperTitle: 'Pending…',
  stages: [
    {
      id: 0,
      name: 'Topic Intelligence',
      shortName: 'Topic',
      status: 'completed',
      agentsActive: [],
    },
    {
      id: 1,
      name: 'Literature Archaeology',
      shortName: 'Literature',
      status: 'running',
      agentsActive: [],
    },
    { id: 2, name: 'Novelty Detection', shortName: 'Novelty', status: 'pending', agentsActive: [] },
  ],
};

describe('Dashboard', () => {
  it('derives stage counts and progress from the run instead of hardcoding nine', () => {
    render(
      <PipelineProvider initialRuns={[shortRun]}>
        <Dashboard onNavigate={vi.fn()} />
      </PipelineProvider>,
    );

    const card = screen.getByRole('button', { name: /Open pipeline run: Ion thruster plume/ });
    expect(card.textContent).toContain('1/3');
    expect(card.textContent).toContain('33%');
    expect(card.textContent).toContain('Literature Archaeology');
  });

  it('navigates to the selected run and keeps the card keyboard operable', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <PipelineProvider initialRuns={[shortRun]}>
        <Dashboard onNavigate={onNavigate} />
      </PipelineProvider>,
    );

    const card = screen.getByRole('button', { name: /Open pipeline run: Ion thruster plume/ });
    card.focus();
    expect(card).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith('pipeline', 'run-short');
  });

  it('shows the fixture totals rather than invented engagement numbers', () => {
    render(
      <PipelineProvider initialRuns={[shortRun]}>
        <Dashboard onNavigate={vi.fn()} />
      </PipelineProvider>,
    );

    expect(screen.getByText('Papers in fixture set')).toBeInTheDocument();
    expect(screen.queryByText(/1,382|247/)).not.toBeInTheDocument();
  });
});
