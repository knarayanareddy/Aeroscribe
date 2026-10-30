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

    expect(
      screen.getByText(/the researcher dashboard and this site are implemented/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the dashboard/i })).toHaveAttribute(
      'href',
      '/Aeroscribe/dashboard/',
    );
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
