import { NARRATION_SECONDS } from './narration';

/**
 * The cut, in one place.
 *
 * A scene now lasts as long as its narration plus a little air: `frames` is
 * derived, never typed, so re-recording a line moves the cut with it instead of
 * leaving the voice running into the next scene. `designFrames` is the length
 * the scene's animation was drawn for, which the pacing layer in `anim.ts` uses
 * to slow staged reveals down in proportion (see `SceneTimingProvider`).
 */
export const FPS = 30;

export const SCENES = [
  { id: 'title', designFrames: 108 },
  { id: 'trace', designFrames: 150 },
  { id: 'pipeline', designFrames: 162 },
  { id: 'evidence', designFrames: 174 },
  { id: 'plan', designFrames: 162 },
  { id: 'citations', designFrames: 150 },
  { id: 'figure', designFrames: 150 },
  { id: 'review', designFrames: 174 },
  { id: 'limits', designFrames: 150 },
  { id: 'outro', designFrames: 114 },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];

/** Silence before the voice starts, so a cut lands before its first syllable. */
export const LEAD_FRAMES = 6;

/** Air after the voice stops, so a sentence does not land on the next cut. */
export const TAIL_FRAMES = 15;

export interface PlacedScene {
  id: SceneId;
  frames: number;
  /** Length the scene's animations were written against. */
  designFrames: number;
  /** Frames of narration, measured from the committed clip. */
  audioFrames: number;
  /** The first frame of the scene, counted from the start of the video. */
  from: number;
}

export const timeline: readonly PlacedScene[] = (() => {
  let from = 0;
  return SCENES.map((scene) => {
    const audioFrames = Math.ceil(NARRATION_SECONDS[scene.id] * FPS);
    // A scene is its narration plus air, and never shorter than the animation
    // it was drawn for — a silent scene would otherwise render as a flash.
    const frames = Math.max(scene.designFrames, LEAD_FRAMES + audioFrames + TAIL_FRAMES);
    const placed = { id: scene.id, frames, designFrames: scene.designFrames, audioFrames, from };
    from += frames;
    return placed;
  });
})();

export const totalFrames = timeline.reduce((total, scene) => total + scene.frames, 0);

/** Seconds, for the README and for the render log. */
export const durationSeconds = totalFrames / FPS;
