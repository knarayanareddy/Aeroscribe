import { interpolate } from 'remotion';
import { easedAt, stagger, useSceneFrame } from '../anim';
import { Chip } from '../components/Chip';
import { SceneFrame } from '../components/SceneFrame';
import { plan, planRecord, resultsParagraph } from '../data';
import { theme } from '../theme';

/**
 * RULE-030: the manuscript is a projection of a plan that was written first.
 *
 * The left panel is the plan record — a real one, `manuscript-plan` #5 — with
 * the paragraph ids the text must contain. The right panel is what the writer
 * produced for one of them. The arrow in the middle is the check stage 6 runs:
 * same ids, declared numbers only.
 */
export function Plan() {
  const frame = useSceneFrame();
  const arrow = easedAt(frame, 40, 20);
  const section = plan.sections.find((entry) =>
    entry.paragraphs.some((paragraph) => paragraph.id === resultsParagraph.id),
  );

  return (
    <SceneFrame
      kicker="RULE-030 · the manuscript plan"
      title="The plan is a record, not a prompt."
      lede="Stage 5 writes the structure — one paragraph per job, with the numbers each may print — as its own evidence record, then renders prose only through it."
      footnote={
        <>
          <Chip tone="violet" mono size={15}>
            {`manuscript-plan · record ${String(planRecord.seq)}`}
          </Chip>
          <span>{`${String(plan.sections.length)} sections, ${String(plan.sections.reduce((total, entry) => total + entry.paragraphs.length, 0))} planned paragraphs`}</span>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 26 }}>
        <div
          style={{
            flex: '0 0 690px',
            border: `1px solid ${theme.colors.border}`,
            background: 'rgba(10, 17, 34, 0.72)',
            borderRadius: 18,
            padding: 30,
            opacity: easedAt(frame, 6, 16),
          }}
        >
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: 13,
              letterSpacing: 2.6,
              textTransform: 'uppercase',
              color: theme.colors.faint,
              marginBottom: 18,
            }}
          >
            manuscript-plan · record {String(planRecord.seq)}
          </div>
          <div
            style={{
              fontFamily: theme.fonts.heading,
              fontWeight: 600,
              fontSize: 24,
              color: theme.colors.text,
              marginBottom: 14,
            }}
          >
            {section?.heading ?? 'Results'}
          </div>
          {(section?.paragraphs ?? []).map((paragraph, index) => {
            const active = paragraph.id === resultsParagraph.id;
            const appear = easedAt(frame, stagger(index, 14, 8), 14);
            return (
              <div
                key={paragraph.id}
                style={{
                  borderLeft: `2px solid ${active ? theme.colors.blue : theme.colors.border}`,
                  paddingLeft: 18,
                  marginBottom: 16,
                  opacity: appear,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontFamily: theme.fonts.mono,
                    fontSize: 17,
                    color: active ? theme.colors.blue : theme.colors.muted,
                  }}
                >
                  {paragraph.id}
                  <span style={{ color: theme.colors.faint, fontSize: 15 }}>
                    {paragraph.intent}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 16, color: theme.colors.faint }}>
                  numbers:{' '}
                  {paragraph.numberKeys.length > 0
                    ? paragraph.numberKeys.join(', ')
                    : 'none — prose only'}
                  {' · '}
                  budget {String(paragraph.targetWords)} words
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            flex: '0 0 96px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 10,
            opacity: arrow,
          }}
        >
          <div style={{ fontFamily: theme.fonts.mono, fontSize: 13, color: theme.colors.faint }}>
            stage 6
          </div>
          <svg width={86} height={26} viewBox="0 0 86 26">
            <line
              x1={0}
              y1={13}
              x2={interpolate(arrow, [0, 1], [0, 66])}
              y2={13}
              stroke={theme.colors.blue}
              strokeWidth={2}
            />
            <polygon
              points="66,5 80,13 66,21"
              fill={theme.colors.blue}
              opacity={arrow > 0.85 ? 1 : 0}
            />
          </svg>
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: 12,
              color: theme.colors.faint,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            compares
            <br />
            by id
          </div>
        </div>

        <div
          style={{
            flex: 1,
            border: `1px solid ${theme.colors.border}`,
            background: 'rgba(10, 17, 34, 0.72)',
            borderRadius: 18,
            padding: 30,
            opacity: easedAt(frame, 34, 18),
          }}
        >
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: 13,
              letterSpacing: 2.6,
              textTransform: 'uppercase',
              color: theme.colors.faint,
              marginBottom: 18,
            }}
          >
            the text it rendered
          </div>
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: 16,
              color: theme.colors.blue,
              marginBottom: 14,
            }}
          >
            {`¶ ${resultsParagraph.id}`}
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: theme.fonts.heading,
              fontWeight: 600,
              fontSize: 26,
              lineHeight: 1.5,
              color: theme.colors.text,
            }}
          >
            {resultsParagraph.text}
          </p>
          <div
            style={{
              marginTop: 22,
              fontSize: 17,
              lineHeight: 1.55,
              color: theme.colors.faint,
            }}
          >
            Every number in that sentence is one of the keys the plan declared for this paragraph.
            Print one it did not declare and the renderer throws before the record is written.
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
