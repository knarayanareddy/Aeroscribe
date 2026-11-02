import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DemoVideo from './DemoVideo';

/**
 * Vite rewrites `import.meta.env.BASE_URL` to the deployment base (`/Aeroscribe/`
 * on Pages, `/` under the test runner). Asserting a literal `/Aeroscribe/` here
 * would test the Vite config rather than the component, so the expectation is
 * built the same way the component builds its URLs.
 */
const base = import.meta.env.BASE_URL;

describe('DemoVideo', () => {
  it('does not download the file until someone asks to watch it', () => {
    const { container } = render(<DemoVideo />);
    const video = container.querySelector('video');

    // 8.8 MB on load is a page that punishes a phone on a train; the poster is
    // the only thing fetched up front.
    expect(video).toHaveAttribute('preload', 'none');
    expect(video?.getAttribute('poster')).toBe(`${base}demo/poster.jpg`);
    expect(screen.getByRole('button', { name: /play the aeroscribe demo video/i })).toBeVisible();
  });

  it('plays the published copy of the video, not a dev-server path', () => {
    const { container } = render(<DemoVideo />);
    const source = container.querySelector('source');

    expect(source).toHaveAttribute('src', `${base}demo/aeroscribe-demo.mp4`);
    expect(source).toHaveAttribute('type', 'video/mp4');
  });

  it('ships captions and asks for them by default', () => {
    const { container } = render(<DemoVideo />);
    const track = container.querySelector('track');

    // A narrated video without captions is a video half its audience cannot
    // follow, so the track is not optional.
    expect(track).toHaveAttribute('kind', 'captions');
    expect(track).toHaveAttribute('srcLang', 'en');
    expect(track).toHaveAttribute('default');
    expect(track?.getAttribute('src')).toBe(`${base}demo/aeroscribe-demo.vtt`);
  });

  it('says the voice is synthesised rather than implying a narrator', () => {
    render(<DemoVideo />);

    expect(screen.getByText(/synthesised/i)).toBeInTheDocument();
    expect(screen.getByText(/every figure on screen/i)).toBeInTheDocument();
    // The one thing this section must never do is present the run as a
    // successful one; the video shows a refusal and the page says so.
    expect(screen.getByText(/including the parts that failed/i)).toBeInTheDocument();
  });

  it('offers the file itself when playback is unavailable', () => {
    render(<DemoVideo />);

    const downloads = screen.getAllByRole('link', { name: /download/i });
    expect(downloads.length).toBeGreaterThan(0);
    for (const link of downloads) {
      expect(link).toHaveAttribute('href', `${base}demo/aeroscribe-demo.mp4`);
    }
  });
});
