import type { CSSProperties } from 'react';
import { AbsoluteFill } from 'remotion';
import { theme } from '../theme';

/**
 * The field every scene sits on.
 *
 * Two gradients and a grid, no blur filters: a blurred layer costs more per
 * frame than every other element in the video combined, and the render is
 * already 1,500 frames long. The grid is masked to a soft centre so it reads as
 * a technical drawing rather than graph paper.
 */
export function Backdrop() {
  const glow: CSSProperties = {
    backgroundImage: [
      'radial-gradient(900px 560px at 16% 8%, rgba(37, 99, 235, 0.22), transparent 70%)',
      'radial-gradient(820px 520px at 86% 84%, rgba(139, 92, 246, 0.18), transparent 72%)',
    ].join(','),
  };

  const grid: CSSProperties = {
    backgroundImage: [
      'linear-gradient(to right, rgba(148, 163, 184, 0.055) 1px, transparent 1px)',
      'linear-gradient(to bottom, rgba(148, 163, 184, 0.055) 1px, transparent 1px)',
    ].join(','),
    backgroundSize: '64px 64px',
    maskImage: 'radial-gradient(78% 72% at 50% 44%, black 30%, transparent 100%)',
    WebkitMaskImage: 'radial-gradient(78% 72% at 50% 44%, black 30%, transparent 100%)',
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: 'linear-gradient(162deg, #050e22 0%, #020817 46%, #04091a 100%)',
        }}
      />
      <AbsoluteFill style={glow} />
      <AbsoluteFill style={grid} />
    </AbsoluteFill>
  );
}
