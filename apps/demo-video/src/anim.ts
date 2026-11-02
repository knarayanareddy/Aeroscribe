import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Motion helpers.
 *
 * Every animation is a pure function of the frame number — no timers, no
 * randomness, no CSS transitions. That is what lets Remotion render frames out
 * of order, in parallel, and still produce a file that is identical on every
 * machine. A `transition` would look right in the Studio and flicker in the
 * render, which is the one bug this file exists to prevent.
 */

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/** Ease-out cubic: fast in, settled by the end. */
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);

/**
 * A 0→1 ramp over `frames`, starting at `start`, for a given frame.
 *
 * Pure so a scene can call it inside a `.map()` — a hook there would be a
 * conditional hook call, which is exactly the bug React reports and Remotion
 * would render as a scene that animates differently on a re-render.
 */
export function rampAt(frame: number, start: number, frames: number): number {
  if (frames <= 0) return frame >= start ? 1 : 0;
  return clamp((frame - start) / frames);
}

/** `rampAt`, eased. */
export function easedAt(frame: number, start: number, frames: number): number {
  return easeOut(rampAt(frame, start, frames));
}

/**
 * A 0→1 ramp over `frames`, starting at `start`, at the current frame.
 *
 * Linear on purpose: the callers ease it themselves, so a scene can use the raw
 * progress for a bar width and an eased copy for an opacity without two clocks.
 */
export function useRamp(start: number, frames: number): number {
  return rampAt(useCurrentFrame(), start, frames);
}

/** The same ramp, eased. */
export function useEased(start: number, frames: number): number {
  return easeOut(useRamp(start, frames));
}

/** Fade in from `start`, and optionally out again at `end`. */
export function useFade(start: number, frames = 14, end?: number): number {
  const inner = useEased(start, frames);
  // `end` is absent more often than not, but the hook still runs: a hook after
  // an early return is a hook React is allowed to call in a different order.
  const out = useRamp(end ?? Number.MAX_SAFE_INTEGER, 12);
  return end === undefined ? inner : inner * (1 - out);
}

/**
 * A spring that has settled by its own nature — used for the things that should
 * feel physical (a panel arriving, a number landing), never for opacity.
 */
export function useLanding(start: number, damping = 26, stiffness = 140): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - start,
    fps,
    config: { damping, stiffness, mass: 0.7 },
  });
}

/** `translateY` for an element that rises into place. */
export function useRise(start: number, distance = 26, frames = 16): number {
  return interpolate(useEased(start, frames), [0, 1], [distance, 0]);
}

/** A staggered delay: item `index` starts `step` frames after item 0. */
export function stagger(index: number, start: number, step: number): number {
  return start + index * step;
}
