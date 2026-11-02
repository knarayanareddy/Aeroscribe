import { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';

/**
 * Paced time.
 *
 * The scenes were drawn for five-second cuts: a table of eleven rows appears in
 * about two seconds, because two seconds was a third of the scene. With a
 * voiceover the same scene runs fifteen seconds, and staged reveals that finish
 * in the first tenth of it leave the narrator talking over a still frame.
 *
 * So each scene renders on a clock that runs slower than wall time. Inside a
 * `SceneTimingProvider`, `useSceneFrame()` returns the frame multiplied by
 * `sqrt(designFrames / actualFrames)` — the square root, because the two
 * failures are opposite: leave the timings alone and the scene dies early,
 * stretch them linearly and a 16-frame fade becomes a two-and-a-half-second
 * dissolve. The square root spreads the reveals over roughly 60% of the scene
 * and turns fades into ~1.5x, which reads as deliberate rather than slow.
 *
 * All the animation hooks in `anim.ts` read paced time, so a scene written
 * against 150 frames needs no retuning when its narration turns out to be 500.
 */
export interface SceneTiming {
  /** Frames the scene actually runs for. */
  frames: number;
  /** Frames its animation timings were written against. */
  designFrames: number;
}

export const SceneTimingContext = createContext<SceneTiming | null>(null);

/**
 * The frame the scene's animations should see.
 *
 * Falls back to the real frame outside a provider, so a scene renders the same
 * way in isolation (and in the tests) as it does in the composition.
 */
export function useSceneFrame(): number {
  const frame = useCurrentFrame();
  const timing = useContext(SceneTimingContext);
  if (!timing) return frame;
  return frame * Math.sqrt(timing.designFrames / timing.frames);
}

/** How far through the scene we are, 0→1, in real frames. For slow drift. */
export function useSceneProgress(): number {
  const frame = useCurrentFrame();
  const timing = useContext(SceneTimingContext);
  if (!timing) return 0;
  return Math.min(1, Math.max(0, frame / timing.frames));
}
