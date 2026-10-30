import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ContactSection from './ContactSection';

describe('ContactSection', () => {
  it('says what will happen before the visitor submits', () => {
    render(<ContactSection />);

    expect(screen.getByText(/No backend is connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/Message sent/i)).not.toBeInTheDocument();
  });

  it('marks the required fields so the browser can validate them', () => {
    render(<ContactSection />);

    expect(screen.getByLabelText(/Full name/i)).toBeRequired();
    expect(screen.getByLabelText(/Email address/i)).toBeRequired();
    expect(screen.getByLabelText(/Message/i)).toBeRequired();
    expect(screen.getByRole('button', { name: /Continue to GitHub issue/i })).toBeEnabled();
  });
});
