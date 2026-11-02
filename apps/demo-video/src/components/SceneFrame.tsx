import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { useEased, useRise } from '../anim';
import { theme } from '../theme';
import { Backdrop } from './Backdrop';

interface SceneFrameProps {
  /** `RULE-030`, `PIPELINE` — the small mono label above the headline. */
  kicker: string;
  title: string;
  /** One line under the title, when the title is not the whole thought. */
  lede?: string;
  children: ReactNode;
  /** Bottom-left caption, usually the thing the scene is evidence for. */
  footnote?: ReactNode;
}

/**
 * The layout every scene shares: kicker, headline, body, footnote.
 *
 * Keeping it in one component is what makes ten independently written scenes
 * cut together: the headline lands at the same height in all of them, so the
 * eye does not have to re-find it on every cut.
 */
export function SceneFrame({ kicker, title, lede, children, footnote }: SceneFrameProps) {
  const enter = useEased(0, 16);
  const rise = useRise(0, 18, 18);

  return (
    <AbsoluteFill style={{ color: theme.colors.text, fontFamily: theme.fonts.body }}>
      <Backdrop />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: `${theme.layout.marginY}px ${theme.layout.marginX}px`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header style={{ opacity: enter, transform: `translateY(${rise}px)` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontFamily: theme.fonts.mono,
              fontSize: 15,
              letterSpacing: 3.4,
              textTransform: 'uppercase',
              color: theme.colors.blue,
            }}
          >
            <span
              style={{
                width: 34,
                height: 2,
                background: theme.colors.blue,
                display: 'inline-block',
              }}
            />
            {kicker}
          </div>
          <h1
            style={{
              margin: '22px 0 0',
              fontFamily: theme.fonts.heading,
              fontWeight: 600,
              fontSize: theme.layout.titleSize,
              lineHeight: 1.08,
              letterSpacing: -1.2,
              maxWidth: 1280,
            }}
          >
            {title}
          </h1>
          {lede ? (
            <p
              style={{
                margin: '20px 0 0',
                fontSize: theme.layout.bodySize,
                lineHeight: 1.5,
                color: theme.colors.muted,
                maxWidth: 1020,
              }}
            >
              {lede}
            </p>
          ) : null}
        </header>

        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        >
          {children}
        </div>

        {footnote ? (
          <footer
            style={{
              fontSize: 19,
              color: theme.colors.faint,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {footnote}
          </footer>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
