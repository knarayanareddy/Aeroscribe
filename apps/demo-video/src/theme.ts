/**
 * One palette, one type scale, one place to change them.
 *
 * The colours are the landing page's (`#020817` field, blue-to-violet accent),
 * and the three families are the ones it self-hosts, so the video and the site
 * a visitor opens next look like the same product.
 */
export const theme = {
  colors: {
    bg: '#020817',
    bgDeep: '#01040d',
    panel: '#0a1122',
    panelRaised: '#0e1730',
    border: 'rgba(148, 163, 184, 0.18)',
    borderStrong: 'rgba(148, 163, 184, 0.32)',
    text: '#e8eefb',
    muted: '#9aa9c2',
    faint: '#5c6b85',
    blue: '#60a5fa',
    blueDeep: '#2563eb',
    violet: '#a78bfa',
    emerald: '#34d399',
    amber: '#fbbf24',
    rose: '#fb7185',
  },
  fonts: {
    /** Orbitron: the wordmark and nothing else. */
    display: 'Orbitron',
    /** Space Grotesk: every headline. */
    heading: 'Space Grotesk',
    /** Inter: body copy. */
    body: 'Inter',
    /** A real monospace stack, because hashes must not be justified text. */
    mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  },
  /** The canvas is 1920 × 1080; these are the margins everything sits inside. */
  layout: {
    marginX: 148,
    marginY: 108,
    titleSize: 66,
    bodySize: 25,
  },
} as const;

export type Theme = typeof theme;
