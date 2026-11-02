import { useCurrentFrame } from 'remotion';
import { easedAt, stagger } from '../anim';
import { Chip } from '../components/Chip';
import { SceneFrame } from '../components/SceneFrame';
import { council, projectionFinding, submission } from '../data';
import { theme } from '../theme';

/**
 * The council, on the run this video is made of.
 *
 * This is the scene that keeps the demo honest. The recorded run did not pass:
 * the council asked for revisions, one paragraph printed a number its plan did
 * not declare, and stage 8 stayed shut. Showing that is the product working.
 */
/** A count at the start of a sentence is a word, not a numeral. */
const WORDS: Record<number, string> = {
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
};

export function Review() {
  const frame = useCurrentFrame();
  const verdict = easedAt(frame, 62, 18);

  return (
    <SceneFrame
      kicker="The review council"
      title="When the text disagrees with its evidence, the gate stays shut."
      lede={`${WORDS[council.checks.length] ?? String(council.checks.length)} checks with stated rule ids, run on the manuscript stage 5 actually wrote. Any major finding sets the verdict to revise, and a revise verdict is a submission blocker — not a comment in a margin.`}
      footnote={
        <>
          <Chip tone="rose" mono size={15}>
            {`verdict: ${council.verdict}`}
          </Chip>
          <span>{`${String(council.major)} major findings · stage 8: ${submission.status}`}</span>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 44, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 720px' }}>
          {council.checks.map((check, index) => {
            const appear = easedAt(frame, stagger(index, 6, 5), 12);
            return (
              <div
                key={check.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '11px 0',
                  borderBottom: `1px solid rgba(148, 163, 184, 0.1)`,
                  opacity: appear,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 600,
                    color: check.passed ? theme.colors.emerald : theme.colors.rose,
                    background: check.passed ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                    border: `1px solid ${check.passed ? 'rgba(52,211,153,0.45)' : 'rgba(251,113,133,0.45)'}`,
                  }}
                >
                  {check.skipped ? '–' : check.passed ? '✓' : '✕'}
                </span>
                <span
                  style={{
                    fontFamily: theme.fonts.mono,
                    fontSize: 18,
                    color: theme.colors.text,
                    width: 196,
                  }}
                >
                  {check.id}
                </span>
                <span style={{ fontSize: 18, color: theme.colors.faint }}>
                  {check.passed ? 'passed' : check.skipped ? 'skipped' : 'finding'}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, opacity: verdict }}>
          <div
            style={{
              border: `1px solid rgba(251, 113, 133, 0.4)`,
              background: 'rgba(244, 63, 94, 0.08)',
              borderRadius: 18,
              padding: 28,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontFamily: theme.fonts.mono,
                  fontSize: 13,
                  letterSpacing: 2.6,
                  textTransform: 'uppercase',
                  color: theme.colors.rose,
                }}
              >
                verdict
              </span>
              <span
                style={{
                  fontFamily: theme.fonts.heading,
                  fontWeight: 600,
                  fontSize: 40,
                  color: theme.colors.rose,
                  letterSpacing: -0.5,
                }}
              >
                {council.verdict}
              </span>
            </div>
            <div
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: 15,
                color: theme.colors.faint,
                marginBottom: 8,
              }}
            >
              RULE-030 · projection of the plan
            </div>
            <p style={{ margin: 0, fontSize: 19, lineHeight: 1.6, color: theme.colors.text }}>
              {projectionFinding}
            </p>
          </div>

          <div
            style={{
              marginTop: 22,
              border: `1px solid ${theme.colors.border}`,
              background: 'rgba(10, 17, 34, 0.72)',
              borderRadius: 18,
              padding: 24,
            }}
          >
            {/* Not a paraphrase: the blocker strings below are the ones the
                submission-package record wrote, in the order it wrote them. */}
            <div
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: 13,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: theme.colors.faint,
                marginBottom: 12,
              }}
            >
              {`Stage 8 recorded ${String(submission.blockers.length)} blockers`}
            </div>
            {submission.blockers.map((blocker, index) => {
              const appear = easedAt(frame, 74 + index * 6, 12);
              return (
                <div
                  key={blocker}
                  style={{
                    display: 'flex',
                    gap: 12,
                    fontSize: 16,
                    lineHeight: 1.5,
                    color: theme.colors.muted,
                    padding: '5px 0',
                    opacity: appear,
                  }}
                >
                  <span style={{ color: theme.colors.rose }}>·</span>
                  <span>{blocker}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
