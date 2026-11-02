import type { ReactNode } from 'react';
import { SceneTimingContext, type SceneTiming } from '../scene-timing';

/**
 * Hands a scene its real length and the length its animation was drawn for.
 *
 * Kept in its own file so `scene-timing.ts` can hold the hooks and the context
 * without exporting a component — a file that exports both defeats fast refresh
 * in the Studio, and the Studio is where these scenes get written.
 */
export function SceneTimingProvider({
  frames,
  designFrames,
  children,
}: SceneTiming & { children: ReactNode }) {
  return (
    <SceneTimingContext.Provider value={{ frames, designFrames }}>
      {children}
    </SceneTimingContext.Provider>
  );
}
