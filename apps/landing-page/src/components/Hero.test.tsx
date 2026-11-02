import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Hero from './Hero';

describe('Hero', () => {
  it('renders the full headline in the DOM without waiting for an animation', () => {
    render(<Hero />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Autonomous aerospace research,');
    expect(heading.textContent).toContain('one auditable pipeline');
  });

  it('states the prototype status and links to the dashboard', () => {
    render(<Hero />);

    expect(screen.getByText(/the researcher dashboard and the agent API/i)).toBeInTheDocument();
    // The old copy claimed the backend did not exist; it must not come back.
    expect(screen.queryByText(/is not running yet/i)).not.toBeInTheDocument();
    // Nor may it claim the dashboard is unwired: live mode exists and is opt-in
    // at build time, which is what IMPLEMENTATION_STATUS.md says.
    expect(screen.queryByText(/not wired to the API/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/a live build, opt-in at build time, reads the API/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/marked synthetic/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the dashboard/i })).toHaveAttribute(
      'href',
      '/Aeroscribe/dashboard/',
    );
  });

  it('offers the demo without making anyone hunt for it', () => {
    render(<Hero />);

    // The demo is the fastest way to understand the project; a visitor who has
    // to scroll past three sections to find it is a visitor who leaves.
    const demo = screen.getByRole('link', { name: /watch the .*demo/i });
    expect(demo).toHaveAttribute('href', '#demo');
    expect(demo.textContent).toMatch(/2½-minute/);
  });

  it('does not advertise invented accuracy figures', () => {
    render(<Hero />);

    expect(screen.queryByText(/99\.7%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,382|1,234|247/)).not.toBeInTheDocument();

    // The stat block reports verifiable facts about the project, not accuracy claims.
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    expect(terms).toContain('Pipeline stages');
    expect(terms).toContain('Specified gate checkpoints');
  });
});
