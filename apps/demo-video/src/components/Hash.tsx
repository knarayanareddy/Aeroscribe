import { theme } from '../theme';

interface HashProps {
  value: string;
  /** Characters of the digest to show before the ellipsis. */
  head?: number;
  size?: number;
  color?: string;
}

/**
 * A shortened SHA-256, in monospace.
 *
 * Twelve hex characters is 48 bits: enough that two records in one run cannot
 * collide on screen, short enough to read at video scale. The full digest is
 * always in the record — this is a label, not a summary of one.
 */
export function Hash({ value, head = 12, size = 17, color = theme.colors.faint }: HashProps) {
  return (
    <span style={{ fontFamily: theme.fonts.mono, fontSize: size, color }}>
      {value.slice(0, head)}
      <span style={{ opacity: 0.55 }}>…</span>
    </span>
  );
}
