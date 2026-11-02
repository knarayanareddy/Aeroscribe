import { AbsoluteFill } from 'remotion';
import { useEased, useFade, useRise } from '../anim';
import { Backdrop } from '../components/Backdrop';
import { chain, gateCount, stages } from '../data';
import { theme } from '../theme';

/**
 * The opening card: what this is, and the three counts that describe it.
 *
 * The counts are computed from `packages/pipeline` and the recorded run, never
 * typed here — the landing page makes the same claim with the same numbers, and
 * a video that rounded them differently would be its own small lie.
 */
export function Title() {
  const wordmark = useEased(4, 22);
  const wordmarkRise = useRise(4, 28, 22);
  const tagline = useFade(18, 18);
  const stats = useFade(30, 16);
  const rule = useEased(2, 30);

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
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.mono,
            fontSize: 16,
            letterSpacing: 5.2,
            textTransform: 'uppercase',
            color: theme.colors.blue,
            opacity: tagline,
            marginBottom: 30,
          }}
        >
          Open prototype · MIT
        </div>

        <div
          style={{
            position: 'relative',
            opacity: wordmark,
            transform: `translateY(${wordmarkRise}px) scale(${0.985 + wordmark * 0.015})`,
          }}
        >
          <div
            style={{
              fontFamily: theme.fonts.display,
              fontWeight: 700,
              fontSize: 132,
              letterSpacing: 2,
              lineHeight: 1,
              backgroundImage: `linear-gradient(104deg, #ffffff 12%, ${theme.colors.blue} 52%, ${theme.colors.violet} 92%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            AeroScribe
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            width: 620 * rule,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${theme.colors.blue}, transparent)`,
            opacity: 0.8,
          }}
        />

        <p
          style={{
            margin: '34px 0 0',
            fontFamily: theme.fonts.heading,
            fontWeight: 600,
            fontSize: 38,
            letterSpacing: -0.4,
            color: theme.colors.text,
            opacity: tagline,
          }}
        >
          An auditable autonomous aerospace research pipeline
        </p>

        <p
          style={{
            margin: '18px 0 0',
            maxWidth: 980,
            textAlign: 'center',
            fontSize: 24,
            lineHeight: 1.55,
            color: theme.colors.muted,
            opacity: tagline,
          }}
        >
          From a research question to a submission package, with every number it prints traced to a
          checksummed evidence record.
        </p>

        <div
          style={{
            marginTop: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 54,
            opacity: stats,
          }}
        >
          {[
            { value: String(stages.length), label: 'gated stages' },
            { value: String(gateCount), label: 'human checkpoints' },
            { value: String(chain.length), label: 'evidence records, this run' },
          ].map((stat, index) => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 54 }}>
              {index > 0 ? (
                <span
                  style={{
                    width: 1,
                    height: 56,
                    background: theme.colors.border,
                    display: 'block',
                  }}
                />
              ) : null}
              <div style={{ textAlign: 'left' }}>
                <div
                  style={{
                    fontFamily: theme.fonts.heading,
                    fontWeight: 600,
                    fontSize: 46,
                    color: theme.colors.text,
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: 18, color: theme.colors.faint, letterSpacing: 0.3 }}>
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
