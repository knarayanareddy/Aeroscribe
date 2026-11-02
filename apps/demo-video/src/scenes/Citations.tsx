import { useCurrentFrame } from 'remotion';
import { easedAt } from '../anim';
import { Chip } from '../components/Chip';
import { SceneFrame } from '../components/SceneFrame';
import { firstReference, references } from '../data';
import { theme } from '../theme';

/**
 * RULE-032: a citation is set from a record, then parsed back.
 *
 * The reference on screen is the manuscript's own line for `ref-01`. Stage 5
 * formats every reference and inverts the result; a field the form loses fails
 * the stage, so the bibliography cannot quietly disagree with the registry.
 */
export function Citations() {
  const frame = useCurrentFrame();
  const reference = references[0]!;
  const words = reference.line.split(' ');
  const fields: Array<[string, string]> = [
    ['title', firstReference.title ?? '—'],
    ['venue', firstReference.venue ?? '—'],
    ['year', String(firstReference.year ?? '—')],
    ['volume', firstReference.volume ?? '—'],
    ['issue', firstReference.issue ?? 'not recorded'],
    ['pages', firstReference.pages ?? '—'],
    ['doi', firstReference.doi ?? '—'],
  ];

  return (
    <SceneFrame
      kicker="RULE-032 · AIAA citations"
      title="Citations are set from records, then read back."
      lede="No template strings and no model: the formatter builds the journal, conference and book forms from the structured record, and stage 5 inverts the output to prove no field was dropped."
      footnote={
        <>
          <Chip tone={reference.missing.length > 0 ? 'amber' : 'emerald'} mono size={15}>
            {`${reference.style ?? 'aiaa'} · missing: ${reference.missing.length > 0 ? reference.missing.join(', ') : 'nothing'}`}
          </Chip>
          <span>{`${String(references.length)} references, all DOI-verified`}</span>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 40, alignItems: 'stretch' }}>
        <div
          style={{
            flex: '0 0 560px',
            border: `1px solid ${theme.colors.border}`,
            background: 'rgba(10, 17, 34, 0.7)',
            borderRadius: 18,
            padding: 28,
            opacity: easedAt(frame, 4, 16),
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
            reference record · {firstReference.key}
          </div>
          {fields.map(([label, value], index) => (
            <div
              key={label}
              style={{
                display: 'flex',
                gap: 16,
                padding: '7px 0',
                borderBottom: `1px solid rgba(148, 163, 184, 0.08)`,
                opacity: easedAt(frame, 8 + index * 3, 12),
              }}
            >
              <span
                style={{
                  width: 92,
                  flex: '0 0 auto',
                  fontFamily: theme.fonts.mono,
                  fontSize: 15,
                  color: theme.colors.faint,
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 18,
                  color: value === 'not recorded' ? theme.colors.amber : theme.colors.text,
                  lineHeight: 1.35,
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Chip tone="emerald" mono size={15}>
              format → parse → compare
            </Chip>
            <span style={{ fontSize: 17, color: theme.colors.faint }}>
              every printed field must survive the round trip
            </span>
          </div>

          <div
            style={{
              border: `1px solid ${theme.colors.borderStrong}`,
              background: 'rgba(10, 17, 34, 0.82)',
              borderRadius: 18,
              padding: 32,
              minHeight: 210,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: theme.fonts.heading,
                fontWeight: 600,
                fontSize: 28,
                lineHeight: 1.55,
                color: theme.colors.text,
              }}
            >
              {words.map((word, index) => (
                <span
                  key={`${word}-${String(index)}`}
                  style={{ opacity: easedAt(frame, 18 + index * 1.6, 8) }}
                >
                  {word}
                  {index < words.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>

          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.6, color: theme.colors.muted }}>
            The record carries no issue number, so the form omits it and says so — the citation
            lists what it left out instead of inventing a volume that reads well.
          </p>
        </div>
      </div>
    </SceneFrame>
  );
}
