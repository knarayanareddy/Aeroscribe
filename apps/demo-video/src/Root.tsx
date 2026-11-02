import { Composition } from 'remotion';
import { AeroScribeDemo } from './AeroScribeDemo';
import { FPS, totalFrames } from './timeline';

/**
 * One composition: the demo. Its length is the sum of the scenes, so the file
 * the renderer writes can never end mid-scene.
 */
export function RemotionRoot() {
  return (
    <Composition
      id="AeroScribeDemo"
      component={AeroScribeDemo}
      durationInFrames={totalFrames}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
