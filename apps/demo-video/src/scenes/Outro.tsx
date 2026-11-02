import { AbsoluteFill } from 'remotion';
import { useEased, useFade, useRise } from '../anim';
import { Backdrop } from '../components/Backdrop';
import { council, run } from '../data';
import { theme } from '../theme';

/** The last card: where to look, and what the licence is. */
export function Outro() {
  const mark = useFade(2, 16);
  const rise = useRise(2, 20, 18);
  const links = useEased(18, 22);

  return (
    <AbsoluteFill style={{ color: theme.colors.text, fontFamily: theme.fonts.body }}>
      <Backdrop />
      <AbsoluteFill
        style={{
          padding: `0 ${theme.layout.marginX}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: 74,
            letterSpacing: 1.5,
            opacity: mark,
            transform: `translateY(${rise}px)`,
            backgroundImage: `linear-gradient(104deg, #ffffff 10%, ${theme.colors.blue} 55%, ${theme.colors.violet} 95%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          AeroScribe
        </div>

        <div
          style={{
            fontFamily: theme.fonts.heading,
            fontWeight: 600,
            fontSize: 30,
            color: theme.colors.muted,
            opacity: links,
          }}
        >
          {`A real run, ${String(run.wordCount)} words, ${String(run.referenceCount)} verified references — and a council that said ${council.verdict}.`}
        </div>

        <div
          style={{
            marginTop: 44,
            display: 'flex',
            gap: 22,
            opacity: links,
          }}
        >
          {[
            { label: 'knarayanareddy.github.io/Aeroscribe', tone: 'blue' as const },
            { label: 'github.com/knarayanareddy/Aeroscribe', tone: 'muted' as const },
            { label: 'MIT', tone: 'emerald' as const },
          ].map((item) => (
            <span
              key={item.label}
              style={{
                padding: '12px 20px',
                borderRadius: 12,
                border: `1px solid ${theme.colors.border}`,
                background: 'rgba(10, 17, 34, 0.7)',
                fontFamily: theme.fonts.mono,
                fontSize: 19,
                color:
                  item.tone === 'blue'
                    ? theme.colors.blue
                    : item.tone === 'emerald'
                      ? theme.colors.emerald
                      : theme.colors.muted,
              }}
            >
              {item.label}
            </span>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 18,
            color: theme.colors.faint,
            opacity: links,
            maxWidth: 900,
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          Every number in this video is read from one recorded run: the same capture the dashboard's
          tests replay against.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
