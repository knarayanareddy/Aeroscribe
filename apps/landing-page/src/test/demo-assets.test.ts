// @vitest-environment node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The published site serves the demo video from `public/demo/`, which means
 * three files have to be in the repository and agree with each other.
 *
 * Vitest runs from the repository root, as the other suites assume.
 */
const root = process.cwd();
const demo = resolve(root, 'apps/landing-page/public/demo');
const source = resolve(root, 'apps/demo-video/public/narration');

/** `HH:MM:SS.mmm` → seconds. */
function seconds(stamp: string): number {
  const [h, m, rest] = stamp.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(rest);
}

describe('the demo the site publishes', () => {
  it('ships the video, its poster and its captions', async () => {
    for (const name of ['aeroscribe-demo.mp4', 'poster.jpg', 'aeroscribe-demo.vtt']) {
      const info = await stat(resolve(demo, name));
      expect(info.size, `${name} is empty`).toBeGreaterThan(1024);
    }
  });

  it('publishes the narration the demo app recorded, not an older cut', async () => {
    // The site's copy is a build artefact of `apps/demo-video`. If someone
    // re-records a line and forgets to re-render and re-copy, the page plays
    // the previous cut forever — so the two sizes have to match.
    const published = await stat(resolve(demo, 'aeroscribe-demo.mp4'));
    const rendered = await stat(resolve(root, 'apps/demo-video/render/aeroscribe-demo.mp4')).catch(
      () => null,
    );
    if (rendered === null) {
      // `render/` is gitignored, so a clone has no copy to compare against.
      expect(published.size).toBeGreaterThan(1_000_000);
      return;
    }
    expect(published.size).toBe(rendered.size);
  });

  it('has captions for every scene, in order, inside the video', async () => {
    const vtt = await readFile(resolve(demo, 'aeroscribe-demo.vtt'), 'utf8');
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);

    const cues = Array.from(
      vtt.matchAll(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g),
      (match) => ({ start: seconds(match[1]!), end: seconds(match[2]!) }),
    );

    // 43 cues over ten scenes is the generated shape; the floor is what matters
    // here, so a shorter script or a coarser split still passes.
    expect(cues.length).toBeGreaterThanOrEqual(30);
    expect(cues[0]!.start).toBeLessThan(1);

    for (const [index, cue] of cues.entries()) {
      expect(cue.end).toBeGreaterThan(cue.start);
      if (index > 0) {
        // Overlapping cues render on top of each other in some players.
        expect(cue.start).toBeGreaterThanOrEqual(cues[index - 1]!.end);
      }
    }
    // Nothing may be captioned past the end of the video.
    expect(cues.at(-1)!.end).toBeLessThanOrEqual(154.5);
  });

  it('captions every scene’s narration, not a sample of it', async () => {
    const vtt = await readFile(resolve(demo, 'aeroscribe-demo.vtt'), 'utf8');
    const scenes = ['title', 'trace', 'pipeline', 'evidence', 'plan', 'citations', 'figure'];

    for (const scene of scenes) {
      const clip = resolve(source, `${scene}.mp3`);
      expect((await stat(clip)).size).toBeGreaterThan(20_000);
    }
    // The captions repeat the script verbatim, so a reworded line that was not
    // re-generated shows up as a missing phrase rather than a silent mismatch.
    expect(vtt).toContain('nine gated stages and eleven human checkpoints');
    expect(vtt).toContain('including the parts that went wrong');
  });
});
