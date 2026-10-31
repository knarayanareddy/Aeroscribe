import { render as renderRaw, screen } from '@testing-library/react';
import { PipelineProvider } from '../state/PipelineProvider';
import { createFixtureSource } from '../state/fixtureSource';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import WikiView from './WikiView';

/** These tests exercise the fixture view, so render it the way the app does. */
function render(ui: React.ReactElement) {
  return renderRaw(<PipelineProvider source={createFixtureSource()}>{ui}</PipelineProvider>);
}

describe('WikiView', () => {
  it('creates a new draft article and says it is local to the session', async () => {
    const user = userEvent.setup();
    render(<WikiView />);

    await user.click(screen.getByRole('button', { name: /New article/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/not persisted or shared/i);
    expect(screen.getByRole('heading', { level: 2, name: 'Untitled article' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Article body/i), 'Rotating **detonation** engines.');
    await user.click(screen.getByRole('button', { name: /Save draft/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/browser session only/i);
    expect(screen.getByText('detonation').tagName).toBe('STRONG');
  });

  it('renders markdown as inert text rather than HTML', async () => {
    const user = userEvent.setup();
    render(<WikiView />);

    await user.click(screen.getByRole('button', { name: /New article/i }));
    await user.type(
      screen.getByLabelText(/Article body/i),
      'Safe text <script>alert("xss")</script> and <img src=x onerror=alert(1)>',
    );
    await user.click(screen.getByRole('button', { name: /Save draft/i }));

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();
  });
});
