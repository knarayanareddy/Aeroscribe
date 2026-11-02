import type { ComponentType } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { SceneTimingProvider } from './components/SceneTiming';
import { narrationFile } from './narration';
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
import { theme } from './theme';
import { LEAD_FRAMES, timeline, type SceneId } from './timeline';

const SCENE_COMPONENTS: Record<SceneId, ComponentType> = {
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

/**
 * The video: ten scenes, laid end to end, each with its own narration.
 *
 * The voice is placed inside the scene's sequence, off by `LEAD_FRAMES`, so the
 * cut lands a fifth of a second before the sentence starts and the sentence
 * never runs into the next scene — the scene's length is its clip plus that
 * lead and a tail (`timeline.ts`).
 *
 * Every scene also gets `SceneTimingProvider`, which slows its animation clock
 * down to match the longer runtime (see the note in `anim.ts`).
 */
export function AeroScribeDemo() {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      {timeline.map((scene) => {
        const Scene = SCENE_COMPONENTS[scene.id];
        return (
          <Sequence
            key={scene.id}
            from={scene.from}
            durationInFrames={scene.frames}
            name={scene.id}
          >
            <SceneTimingProvider frames={scene.frames} designFrames={scene.designFrames}>
              <Scene />
              <Sequence
                from={LEAD_FRAMES}
                durationInFrames={scene.audioFrames}
                name={`${scene.id} narration`}
              >
                <Audio src={staticFile(narrationFile(scene.id))} />
              </Sequence>
            </SceneTimingProvider>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
