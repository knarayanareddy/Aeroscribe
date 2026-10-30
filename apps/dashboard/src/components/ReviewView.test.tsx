import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReviewView from './ReviewView';

describe('ReviewView', () => {
  it('shows 0% instead of NaN when there are no comments', () => {
    render(<ReviewView initialComments={[]} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByText(/No comments match this filter/i)).toBeInTheDocument();
  });
});
