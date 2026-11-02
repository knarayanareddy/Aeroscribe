import { easedAt, stagger, useSceneFrame } from '../anim';
import { Chip } from '../components/Chip';
import { SceneFrame } from '../components/SceneFrame';
import { cfd, render, submission } from '../data';
import { theme } from '../theme';

/**
 * The three things this run does not have, stated on screen.
 *
 * Every one of them is read from the record — the solver name, the render's
 * `typeset`, the compliance issues — so the video cannot claim a capability the
 * captured run did not exercise. A demo that hides these would be advertising.
 */
export function Limits() {
  const frame = useSceneFrame();

  const rows = [
    {
      label: `solver: ${cfd.solver}`,
      tone: 'amber' as const,
      title: 'The CFD numbers are a benchmark, not a simulation.',
      body: 'The synthetic solver is deterministic and internally consistent, and it solves nothing: no Navier–Stokes equations were evaluated. The manuscript and the figure both say so.',
    },
    {
      label: `render: ${render.typeset}`,
      tone: 'amber' as const,
      title:
        render.typeset === 'pdf'
          ? 'The PDF came from a real TeX toolchain.'
          : 'There is LaTeX source and no PDF, because no toolchain was configured.',
      body: 'Typesetting is a capability, not a promise: without an engine the render record says source-only and stage 8 reports the manuscript as not typeset.',
    },
    {
      label: submission.compliant ? 'compliance: pass' : 'dashboard: fixtures',
      tone: 'rose' as const,
      title: 'The published dashboard renders a recorded run, labelled as fixtures.',
      body: 'The Pages build carries no API address and says so on every screen. Live mode exists and is opt-in at build time; it is not what the public site serves.',
    },
  ];

  return (
    <SceneFrame
      kicker="What it does not claim"
      title="The limits are on the screen, not in a footnote."
      lede="This is the same run the rest of the video showed. Three of its facts are uncomfortable, and all three are printed rather than smoothed over."
      footnote={
        <span>
          docs/IMPLEMENTATION_STATUS.md — the first file to read before trusting anything else
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rows.map((row, index) => {
          const appear = easedAt(frame, stagger(index, 8, 10), 16);
          return (
            <div
              key={row.title}
              style={{
                display: 'flex',
                gap: 26,
                alignItems: 'flex-start',
                border: `1px solid ${theme.colors.border}`,
                background: 'rgba(10, 17, 34, 0.68)',
                borderRadius: 16,
                padding: '22px 26px',
                opacity: appear,
                transform: `translateY(${(1 - appear) * 18}px)`,
              }}
            >
              <div style={{ flex: '0 0 172px', paddingTop: 2 }}>
                <Chip tone={row.tone} mono size={15}>
                  {row.label}
                </Chip>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: theme.fonts.heading,
                    fontWeight: 600,
                    fontSize: 24,
                    color: theme.colors.text,
                    marginBottom: 8,
                  }}
                >
                  {row.title}
                </div>
                <div style={{ fontSize: 18, lineHeight: 1.55, color: theme.colors.muted }}>
                  {row.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
}
