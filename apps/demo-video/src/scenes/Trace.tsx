import { easedAt, stagger, useEased, useRamp, useSceneFrame } from '../anim';
import { Chip } from '../components/Chip';
import { SceneFrame } from '../components/SceneFrame';
import { cfd, cfdRecord, headline, render, resultsParagraph, shortHash } from '../data';
import { theme } from '../theme';

/**
 * One number, followed all the way down.
 *
 * The sentence on the left is the manuscript's own text for `p-results-1`; the
 * nodes on the right are the records that sentence is allowed to print a number
 * because of. This is the whole product in one shot: the claim, the record and
 * the digest, in that order.
 */
export function Trace() {
  const frame = useSceneFrame();
  const line = useRamp(26, 26);
  const claimOpacity = useEased(10, 16);
  const figureOpacity = useEased(24, 16);
  const artefact = cfd.artefacts[0];

  const nodes = [
    {
      kicker: 'the claim',
      title: `manuscript ¶ ${resultsParagraph.id}`,
      detail: `declares: ${resultsParagraph.numberKeys.join(', ')}`,
      hash: null as string | null,
      tone: 'blue' as const,
    },
    {
      kicker: 'the evidence',
      title: `record #${cfdRecord.seq} · ${cfdRecord.kind}`,
      detail: `${cfd.gci?.levels.length ?? 0} mesh levels · solver: ${cfd.solver}`,
      hash: cfdRecord.payloadHash,
      tone: 'violet' as const,
    },
    {
      kicker: 'the artefact',
      title: artefact ? artefact.name : render.template,
      detail: artefact ? `${artefact.bytes} bytes, written by the run` : 'no artefact recorded',
      hash: artefact ? artefact.sha256 : null,
      tone: 'emerald' as const,
    },
  ];

  return (
    <SceneFrame
      kicker="RULE-001 · every number, traced"
      title="A number with no record never reaches the page."
      lede="The writer refuses to produce a manuscript whose numbers it cannot reconstruct from the registry, so this is not a review step — it is the only way prose gets written."
      footnote={
        <>
          <span style={{ color: theme.colors.blue }}>●</span>
          {`record #${cfdRecord.seq} payload hash ${shortHash(cfdRecord.payloadHash, 16)}…`}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 72, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 760px' }}>
          <div
            style={{
              fontSize: 15,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: theme.colors.faint,
              fontFamily: theme.fonts.mono,
              marginBottom: 16,
            }}
          >
            printed in the manuscript
          </div>
          <div
            style={{
              border: `1px solid ${theme.colors.border}`,
              background: 'rgba(10, 17, 34, 0.72)',
              borderRadius: 18,
              padding: 34,
              opacity: claimOpacity,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 31,
                lineHeight: 1.5,
                color: theme.colors.text,
                fontFamily: theme.fonts.heading,
                fontWeight: 600,
              }}
            >
              {resultsParagraph.text}
            </p>
          </div>

          <div
            style={{
              marginTop: 26,
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              opacity: figureOpacity,
            }}
          >
            <span
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: 52,
                color: theme.colors.text,
                letterSpacing: -1.4,
                whiteSpace: 'nowrap',
              }}
            >
              {headline()}
            </span>
            <span style={{ fontSize: 20, color: theme.colors.faint }}>
              {`${cfd.quantity} ± GCI half-width`}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', paddingTop: 10 }}>
          <div
            style={{
              position: 'absolute',
              left: 17,
              top: 34,
              width: 2,
              height: 372,
              background: `linear-gradient(180deg, ${theme.colors.blue}, ${theme.colors.violet}, ${theme.colors.emerald})`,
              transform: `scaleY(${line})`,
              transformOrigin: 'top',
              opacity: 0.55,
            }}
          />
          {nodes.map((node, index) => {
            const start = stagger(index, 20, 22);
            const appear = easedAt(frame, start, 16);
            return (
              <div
                key={node.kicker}
                style={{
                  display: 'flex',
                  gap: 24,
                  marginBottom: 30,
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 16}px)`,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: `2px solid ${theme.colors.borderStrong}`,
                    background: theme.colors.panel,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: theme.fonts.mono,
                    fontSize: 15,
                    color: theme.colors.muted,
                    flex: '0 0 auto',
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: theme.fonts.mono,
                      fontSize: 13,
                      letterSpacing: 2.6,
                      textTransform: 'uppercase',
                      color: theme.colors.faint,
                    }}
                  >
                    {node.kicker}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 24,
                      color: theme.colors.text,
                      fontFamily: theme.fonts.heading,
                      fontWeight: 600,
                    }}
                  >
                    {node.title}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 17, color: theme.colors.muted }}>
                    {node.detail}
                  </div>
                  {node.hash ? (
                    <div style={{ marginTop: 8 }}>
                      <Chip tone={node.tone} mono size={15}>
                        sha256 {shortHash(node.hash, 20)}…
                      </Chip>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div
            style={{
              marginLeft: 60,
              marginTop: 6,
              fontSize: 17,
              color: theme.colors.faint,
              opacity: frame > 80 ? 1 : 0,
            }}
          >
            Re-hash the payload and the digest changes — so an edited number is a broken chain, not
            a quiet correction.
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
