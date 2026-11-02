import type { ReactNode } from 'react';
import { theme } from '../theme';

type Tone = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'muted';

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  blue: { fg: '#bfdbfe', bg: 'rgba(37, 99, 235, 0.16)', border: 'rgba(96, 165, 250, 0.45)' },
  violet: { fg: '#ddd6fe', bg: 'rgba(139, 92, 246, 0.16)', border: 'rgba(167, 139, 250, 0.45)' },
  emerald: { fg: '#a7f3d0', bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(52, 211, 153, 0.45)' },
  amber: { fg: '#fde68a', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.42)' },
  rose: { fg: '#fecdd3', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(251, 113, 133, 0.42)' },
  muted: { fg: '#cbd5e1', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.28)' },
};

interface ChipProps {
  children: ReactNode;
  tone?: Tone;
  /** Monospace suits ids, kinds and digests; prose should not use it. */
  mono?: boolean;
  size?: number;
}

/** A small bordered label: a rule id, an evidence kind, a verdict. */
export function Chip({ children, tone = 'muted', mono = false, size = 18 }: ChipProps) {
  const palette = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 13px',
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        fontFamily: mono ? theme.fonts.mono : theme.fonts.body,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: mono ? 0.4 : 0,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
