import { easedAt, stagger, useSceneFrame } from '../anim';
import { Chip } from '../components/Chip';
import { Hash } from '../components/Hash';
import { SceneFrame } from '../components/SceneFrame';
import { chain } from '../data';
import { theme } from '../theme';

/**
 * The registry, record by record.
 *
 * These are the eleven records one run actually wrote, in chain order, with the
 * first twelve hex characters of each payload hash. The point of the scene is
 * the shape: a list where every line commits to the line above it.
 */
export function Evidence() {
  const frame = useSceneFrame();

  return (
    <SceneFrame
      kicker="The evidence registry"
      title="Every stage leaves a record, and each record commits to the last."
      lede="Append-only and hash-chained: a record's digest covers its payload and its predecessor, so editing history means breaking every link after it."
      footnote={
        <>
          <Chip tone="emerald" mono size={15}>
            {`${String(chain.length)} records · 0 rewritten`}
          </Chip>
          <span>verified on read, not on trust</span>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 64 }}>
        <div style={{ flex: '0 0 880px', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: 19,
              top: 18,
              bottom: 18,
              width: 2,
              background: `linear-gradient(180deg, ${theme.colors.blue}, ${theme.colors.violet} 60%, rgba(139, 92, 246, 0.1))`,
              opacity: 0.5,
            }}
          />
          {chain.map((record, index) => {
            const appear = easedAt(frame, stagger(index, 8, 7), 12);
            return (
              <div
                key={record.seq}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  height: 47,
                  opacity: appear,
                  transform: `translateX(${(1 - appear) * -12}px)`,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    flex: '0 0 auto',
                    borderRadius: 12,
                    border: `1px solid ${theme.colors.borderStrong}`,
                    background: theme.colors.panel,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: theme.fonts.mono,
                    fontSize: 14,
                    color: theme.colors.muted,
                  }}
                >
                  {String(record.seq).padStart(2, '0')}
                </div>
                <div
                  style={{
                    fontFamily: theme.fonts.mono,
                    fontSize: 20,
                    color: theme.colors.text,
                    width: 300,
                  }}
                >
                  {record.kind}
                </div>
                <Hash value={record.payloadHash} head={14} size={17} />
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, paddingTop: 6 }}>
          <div
            style={{
              border: `1px solid ${theme.colors.border}`,
              background: 'rgba(10, 17, 34, 0.72)',
              borderRadius: 18,
              padding: 30,
              opacity: easedAt(frame, 70, 18),
            }}
          >
            <div
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: 13,
                letterSpacing: 2.6,
                textTransform: 'uppercase',
                color: theme.colors.faint,
                marginBottom: 16,
              }}
            >
              how a link is made
            </div>
            <pre
              style={{
                margin: 0,
                fontFamily: theme.fonts.mono,
                fontSize: 17,
                lineHeight: 1.75,
                color: theme.colors.muted,
                whiteSpace: 'pre-wrap',
              }}
            >
              <span style={{ color: theme.colors.blue }}>hash</span>
              {'  = SHA256( payload '}
              <span style={{ color: theme.colors.violet }}>+ prevHash</span>
              {' )\n'}
              <span style={{ color: theme.colors.blue }}>verify</span>
              {' = walk the chain, re-hash every payload'}
            </pre>
            <div
              style={{ marginTop: 20, fontSize: 18, lineHeight: 1.55, color: theme.colors.faint }}
            >
              The registry is a file, not a promise: GET /api/v1/evidence returns these rows, and
              the API refuses to write one that does not extend the chain.
            </div>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
