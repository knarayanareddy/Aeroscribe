import type { ComponentType } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
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
import { timeline, type SceneId } from './timeline';

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
 * The video: ten scenes, laid end to end on the timeline in `timeline.ts`.
 *
 * Each scene owns its own animation and reads the frame relative to its own
 * `Sequence`, so a scene can be moved without rewriting its timings.
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
            <Scene />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
