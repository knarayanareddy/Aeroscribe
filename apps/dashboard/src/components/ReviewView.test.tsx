import { render as renderRaw, screen } from '@testing-library/react';
import { PipelineProvider } from '../state/PipelineProvider';
import { createFixtureSource } from '../state/fixtureSource';
import { describe, expect, it } from 'vitest';
import ReviewView from './ReviewView';

/** These tests exercise the fixture view, so render it the way the app does. */
function render(ui: React.ReactElement) {
  return renderRaw(<PipelineProvider source={createFixtureSource()}>{ui}</PipelineProvider>);
}

describe('ReviewView', () => {
  it('shows 0% instead of NaN when there are no comments', () => {
    render(<ReviewView initialComments={[]} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByText(/No comments match this filter/i)).toBeInTheDocument();
  });
});
