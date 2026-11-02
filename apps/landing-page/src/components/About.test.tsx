import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import About from './About';

describe('About', () => {
  it('reports the dashboard wiring as it is today', () => {
    render(<About />);

    // Live mode exists and is opt-in at build time; the published build is the
    // fixture one. "Not wired" was true before that and must not come back.
    expect(screen.getByText('Live mode · opt-in')).toBeInTheDocument();
    expect(screen.queryByText('Not wired')).not.toBeInTheDocument();
    expect(screen.getByText(/the published dashboard is the fixture build/i)).toBeInTheDocument();
  });
});
