import { easedAt, stagger, useSceneFrame } from '../anim';
import { Chip } from '../components/Chip';
import { SceneFrame } from '../components/SceneFrame';
import { gateCount, stages, submission } from '../data';
import { theme } from '../theme';

/**
 * The pipeline, as the catalogue defines it.
 *
 * Nine cards in reading order, each with the gate it stops at. Stage 4 shows
 * three gates because it really has three checkpoints, which is where the
 * eleven comes from: `gateCount` sums `gateIds` rather than counting stages
 * twice.
 */
export function Pipeline() {
  const frame = useSceneFrame();
  const cfdStage = stages.find((stage) => stage.gateIds.length > 1);

  return (
    <SceneFrame
      kicker="The pipeline"
      title="Nine stages. Every one of them stops for a human."
      lede="No handler hands off to the next on its own. Each stage writes its evidence, opens a gate and waits — and a run cannot advance past a gate nobody approved."
      footnote={
        <>
          {`${String(gateCount)} checkpoints in ${String(stages.length)} stages · the recorded submission is ${submission.status}`}
          {cfdStage ? ` · ${cfdStage.shortName} holds ${cfdStage.gateIds.join(' / ')}` : ''}
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 22,
        }}
      >
        {stages.map((stage, index) => {
          const appear = easedAt(frame, stagger(index, 6, 5), 14);
          return (
            <div
              key={stage.id}
              style={{
                border: `1px solid ${theme.colors.border}`,
                background: 'rgba(10, 17, 34, 0.66)',
                borderRadius: 16,
                padding: '22px 24px',
                opacity: appear,
                transform: `translateY(${(1 - appear) * 18}px)`,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    fontFamily: theme.fonts.mono,
                    fontSize: 15,
                    color: theme.colors.blue,
                    letterSpacing: 1,
                  }}
                >
                  {String(stage.id + 1).padStart(2, '0')}
                </span>
                <span
                  style={{
                    fontFamily: theme.fonts.heading,
                    fontWeight: 600,
                    fontSize: 25,
                    color: theme.colors.text,
                    lineHeight: 1.2,
                  }}
                >
                  {stage.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {stage.gateIds.map((gate) => (
                  <Chip key={gate} tone="violet" mono size={14}>
                    {gate}
                  </Chip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
}
