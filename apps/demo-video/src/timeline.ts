/**
 * The cut, in one place.
 *
 * Scene lengths live here and nowhere else: the composition's duration is the
 * sum and each scene's `from` is the running total, so adding a beat in the
 * middle cannot leave the last scene a few frames short. At 30 fps the whole
 * piece is a little under a minute.
 */
export const FPS = 30;

export const SCENES = [
  { id: 'title', frames: 108 },
  { id: 'trace', frames: 150 },
  { id: 'pipeline', frames: 162 },
  { id: 'evidence', frames: 174 },
  { id: 'plan', frames: 162 },
  { id: 'citations', frames: 150 },
  { id: 'figure', frames: 150 },
  { id: 'review', frames: 174 },
  { id: 'limits', frames: 150 },
  { id: 'outro', frames: 114 },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];

export interface PlacedScene {
  id: SceneId;
  frames: number;
  /** The first frame of the scene, counted from the start of the video. */
  from: number;
}

export const timeline: readonly PlacedScene[] = SCENES.reduce<PlacedScene[]>((placed, scene) => {
  const previous = placed.at(-1);
  return [
    ...placed,
    {
      id: scene.id,
      frames: scene.frames,
      from: previous ? previous.from + previous.frames : 0,
    },
  ];
}, []);

export const totalFrames = SCENES.reduce((total, scene) => total + scene.frames, 0);

/** Seconds, for the README and for the render log. */
export const durationSeconds = totalFrames / FPS;
