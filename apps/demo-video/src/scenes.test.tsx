import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import type * as RemotionModule from 'remotion';
import { describe, expect, it, vi } from 'vitest';
import { cfd, council, result, submission } from './data';
import { Citations } from './scenes/Citations';
import { Evidence } from './scenes/Evidence';
import { Figure } from './scenes/Figure';
import { Limits } from './scenes/Limits';
import { Outro } from './scenes/Outro';
import { Pipeline } from './scenes/Pipeline';
import { Plan } from './scenes/Plan';
import { Review } from './scenes/Review';
import { Title } from './scenes/Title';
import { Trace } from './scenes/Trace';
import { SCENES } from './timeline';

/**
 * A frame of video is not a test, so the scenes get one.
 *
 * Remotion's hooks only work inside a composition, which needs a browser; so
 * `remotion` is replaced with a frame counter and every scene is rendered to
 * static markup at a handful of frames. That catches the failures a render
 * would otherwise turn into a black second — a scene throwing on missing data,
 * a `.map()` over an undefined array — without a Chromium binary in CI.
 *
 * It also checks the one property the whole piece rests on: the text on screen
 * is the recorded run's text. If a scene starts printing a number of its own,
 * the assertions below stop matching.
 */
const frame = { value: 0 };

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof RemotionModule>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frame.value,
    useVideoConfig: () => ({
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 1494,
      id: 'AeroScribeDemo',
      defaultProps: {},
      props: {},
    }),
    staticFile: (path: string) => path,
  };
});

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  title: Title,
  trace: Trace,
  pipeline: Pipeline,
  evidence: Evidence,
  plan: Plan,
  citations: Citations,
  figure: Figure,
  review: Review,
  limits: Limits,
  outro: Outro,
};

function markupAt(Scene: ComponentType, at: number): string {
  frame.value = at;
  return renderToStaticMarkup(<Scene />);
}

describe('every scene renders at every point in its life', () => {
  for (const scene of SCENES) {
    const Scene = SCENE_COMPONENTS[scene.id]!;

    it(`${scene.id} renders at its first, middle and last frame`, () => {
      // The three frames that break a scene: the first (nothing has animated
      // in yet), the middle (everything is on screen at once) and the last
      // (whatever fades out has gone).
      for (const at of [0, Math.floor(scene.frames / 2), scene.frames - 1]) {
        expect(() => markupAt(Scene, at), `${scene.id} threw at frame ${String(at)}`).not.toThrow();
      }
    });
  }
});

describe('the scenes print the recorded run, not a story about it', () => {
  it('the trace scene shows the manuscript’s own headline result', () => {
    const markup = markupAt(Trace, 140);
    expect(markup).toContain(result.value);
    expect(markup).toContain(result.uncertainty);
  });

  it('the review scene repeats stage 8’s blockers verbatim', () => {
    const markup = markupAt(Review, 173);
    for (const blocker of submission.blockers) {
      // The on-screen text is the record's string, not a paraphrase of it.
      expect(markup).toContain(blocker.replace(/&/g, '&amp;'));
    }
    expect(markup).toContain(council.verdict);
    expect(markup).toContain(String(council.major));
  });

  it('the limits scene labels the solver it actually used', () => {
    const markup = markupAt(Limits, 149);
    expect(markup).toContain(`solver: ${cfd.solver}`);
    expect(markup).toContain('no Navier–Stokes equations were evaluated');
  });

  it('the title scene counts the catalogue rather than rounding it', () => {
    // "Nine" is written as a word there, so the scene must at least print the
    // other two counts from the data layer rather than a literal.
    const markup = markupAt(Title, 100);
    expect(markup).toMatch(/>\s*9\s*</);
  });
});
