import { easedAt, stagger, useSceneFrame } from '../anim';
import { Chip } from '../components/Chip';
import { Hash } from '../components/Hash';
import { SceneFrame } from '../components/SceneFrame';
import { cfd, figureRows, gci, mesh, typesetting } from '../data';
import { theme } from '../theme';

const PLOT = { width: 720, height: 380, padLeft: 96, padBottom: 62, padTop: 26, padRight: 40 };

/**
 * RULE-033: the figure is source, not a picture.
 *
 * Plotted from the record's three mesh levels — the same numbers the `.dat`
 * file holds — with the quantity and unit taken from the payload. No image is
 * produced: what the manuscript inputs is pgfplots code, and the render record
 * hashes both files.
 */
export function Figure() {
  const frame = useSceneFrame();

  const values = mesh.map((level) => Number(level.value));
  const cells = mesh.map((level) => level.cells);
  const minX = Math.log10(Math.min(...cells));
  const maxX = Math.log10(Math.max(...cells));
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const spanY = maxY - minY || 1;

  const x = (value: number): number => {
    const t = (Math.log10(value) - minX) / (maxX - minX || 1);
    return PLOT.padLeft + t * (PLOT.width - PLOT.padLeft - PLOT.padRight);
  };
  const y = (value: number): number => {
    const t = (value - minY) / spanY;
    // A tenth of the height of headroom, so the top point is not on the frame.
    return (
      PLOT.height -
      PLOT.padBottom -
      (0.18 + t * 0.66) * (PLOT.height - PLOT.padBottom - PLOT.padTop)
    );
  };

  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(cells[index]!)} ${y(value)}`)
    .join(' ');

  const drawn = easedAt(frame, 34, 26);
  const dataFile = [
    'cells value gci_percent',
    ...figureRows.map((row) => `${String(row.cells)} ${row.value} ${row.gciPercent}`),
  ];

  return (
    <SceneFrame
      kicker="RULE-033 · figures"
      title="The figure is text you can diff."
      lede="Two pgfplots panels and a data file, written from the grid study. No binary asset, no screenshot of a plot: a reviewer reads the numbers LaTeX will draw."
      footnote={
        <>
          <Chip tone="blue" mono size={15}>
            {typesetting.template}
          </Chip>
          <span>
            {typesetting.figure
              ? `figure-gci.dat · ${String(typesetting.figure.bytes)} bytes · `
              : 'figure-gci.dat · '}
          </span>
          {typesetting.figure ? (
            <Hash value={typesetting.figure.sha256} head={16} size={15} />
          ) : null}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 44, alignItems: 'center' }}>
        <div
          style={{
            border: `1px solid ${theme.colors.border}`,
            background: 'rgba(10, 17, 34, 0.72)',
            borderRadius: 18,
            padding: '18px 22px 8px',
          }}
        >
          <svg width={PLOT.width} height={PLOT.height} viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}>
            {/* gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const gy =
                PLOT.height - PLOT.padBottom - tick * (PLOT.height - PLOT.padBottom - PLOT.padTop);
              return (
                <line
                  key={tick}
                  x1={PLOT.padLeft}
                  y1={gy}
                  x2={PLOT.width - PLOT.padRight}
                  y2={gy}
                  stroke="rgba(148, 163, 184, 0.14)"
                  strokeWidth={1}
                />
              );
            })}
            {/* axes */}
            <line
              x1={PLOT.padLeft}
              y1={PLOT.padTop}
              x2={PLOT.padLeft}
              y2={PLOT.height - PLOT.padBottom}
              stroke={theme.colors.borderStrong}
              strokeWidth={2}
            />
            <line
              x1={PLOT.padLeft}
              y1={PLOT.height - PLOT.padBottom}
              x2={PLOT.width - PLOT.padRight}
              y2={PLOT.height - PLOT.padBottom}
              stroke={theme.colors.borderStrong}
              strokeWidth={2}
            />

            {/* the series */}
            <path
              d={path}
              fill="none"
              stroke={theme.colors.blue}
              strokeWidth={2.5}
              strokeDasharray={900}
              strokeDashoffset={900 * (1 - drawn)}
            />

            {mesh.map((level, index) => {
              const appear = easedAt(frame, stagger(index, 52, 8), 12);
              return (
                <g key={level.level} opacity={appear}>
                  <circle
                    cx={x(level.cells)}
                    cy={y(Number(level.value))}
                    r={7}
                    fill={theme.colors.bg}
                    stroke={theme.colors.violet}
                    strokeWidth={3}
                  />
                  <text
                    x={x(level.cells)}
                    y={y(Number(level.value)) - 20}
                    fill={theme.colors.text}
                    fontFamily={theme.fonts.mono}
                    fontSize={17}
                    textAnchor="middle"
                  >
                    {level.value}
                  </text>
                  <text
                    x={x(level.cells)}
                    y={PLOT.height - PLOT.padBottom + 26}
                    fill={theme.colors.faint}
                    fontFamily={theme.fonts.mono}
                    fontSize={15}
                    textAnchor="middle"
                  >
                    {level.cells >= 1_000_000
                      ? `${String(level.cells / 1_000_000)}M`
                      : `${String(level.cells / 1_000)}k`}
                  </text>
                </g>
              );
            })}

            {/* Rotated and centred on the axis: an axis label laid flat would
                collide with the first point's own label. */}
            <text
              transform={`translate(${PLOT.padLeft - 58} ${
                (PLOT.padTop + PLOT.height - PLOT.padBottom) / 2
              }) rotate(-90)`}
              fill={theme.colors.muted}
              fontFamily={theme.fonts.body}
              fontSize={16}
              textAnchor="middle"
            >
              {cfd.quantity}
            </text>
            <text
              x={PLOT.width - PLOT.padRight}
              y={PLOT.height - 12}
              fill={theme.colors.muted}
              fontFamily={theme.fonts.body}
              fontSize={16}
              textAnchor="end"
            >
              cell count
            </text>
          </svg>
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              border: `1px solid ${theme.colors.border}`,
              background: 'rgba(10, 17, 34, 0.82)',
              borderRadius: 18,
              padding: 26,
              opacity: easedAt(frame, 14, 16),
            }}
          >
            <div
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: 13,
                letterSpacing: 2.6,
                textTransform: 'uppercase',
                color: theme.colors.faint,
                marginBottom: 14,
              }}
            >
              figure-gci.dat
            </div>
            <pre
              style={{
                margin: 0,
                fontFamily: theme.fonts.mono,
                fontSize: 17,
                lineHeight: 1.9,
                color: theme.colors.muted,
              }}
            >
              {dataFile.map((line, index) => (
                <div
                  key={line}
                  style={{
                    color: index === 0 ? theme.colors.blue : theme.colors.muted,
                    opacity: easedAt(frame, 20 + index * 5, 10),
                  }}
                >
                  {line}
                </div>
              ))}
            </pre>
          </div>
          <p
            style={{ margin: '22px 0 0', fontSize: 18, lineHeight: 1.6, color: theme.colors.faint }}
          >
            {`Observed order ${gci.apparentOrder ?? '—'} · fine-grid GCI ${gci.finePercent ?? '—'}% · ${gci.valid ? 'inside the asymptotic range' : 'study rejected'}`}
          </p>
        </div>
      </div>
    </SceneFrame>
  );
}
