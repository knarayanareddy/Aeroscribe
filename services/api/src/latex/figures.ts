import type { CfdEvidencePayload, GciLevel } from '@aeroscribe/contract';
import { escapeLatex } from './escape';

/**
 * Grid-convergence figures, as pgfplots source.
 *
 * RULE-033 asks for figures that are reproducible and reviewable: text in, text
 * out, no binary asset anybody has to trust. The `.tex` and `.dat` files this
 * module writes are the figure — LaTeX draws them at typeset time, the numbers
 * are the ones the `cfd-run` record carries, and a reviewer can diff both files.
 *
 * What the figure says about itself matters as much as what it plots:
 * - the header names the run, the evidence record and its SHA-256, so a copied
 *   figure can be traced back to the record it came from;
 * - the caption repeats the provenance, because the header does not survive a
 *   trip through a PDF;
 * - a synthetic run says so, and an invalid study says that too — a plot is the
 *   easiest place in a paper to imply a measurement that was never made.
 */

export interface FigureFile {
  name: string;
  content: string;
}

/** Where a figure came from: enough to find the record and check its digest. */
export interface FigureProvenance {
  runId: string;
  /** `seq` of the `cfd-run` record. */
  seq: number;
  /** `payloadHash` of that record. */
  payloadHash: string;
  /** The record's artefacts, named in the caption when present. */
  artefacts?: ReadonlyArray<{ name: string; sha256: string }>;
}

/** One plotted study. A run has one today; the type allows more, and the legend follows. */
export interface FigureSeries {
  label: string;
  levels: ReadonlyArray<Pick<GciLevel, 'cells' | 'value'>>;
  /** GCI values by cell count of the finer grid of the pair. */
  gciByCells: ReadonlyArray<{ cells: number; percent: number }>;
}

export interface FigureOptions {
  provenance: FigureProvenance;
  /** Quantity of interest, printed in the axis label and the caption. */
  quantity: string;
  /** Unit as the record states it; `dimensionless` prints no unit. */
  unit: string;
  /** Sentence(s) the caption must carry: synthetic, invalid study, … */
  caveats: readonly string[];
}

export interface Figure {
  /** The pgfplots source, ready to `\input`. */
  tex: FigureFile;
  /** One data file per series; always at least one. */
  dat: FigureFile[];
  /** Label the caption defines, for a `\ref`. */
  label: string;
}

export const FIGURE_TEX_NAME = 'figure-gci.tex';
export const FIGURE_DAT_NAME = 'figure-gci.dat';
export const FIGURE_LABEL = 'fig:mesh-study';

/** `dimensionless` carries no unit; anything else is printed in brackets. */
export function unitLabel(unit: string): string {
  const trimmed = (unit ?? '').trim();
  if (trimmed.length === 0 || /^dimensionless$/i.test(trimmed) || trimmed === '-') return '';
  return ` (${trimmed})`;
}

/** Fixed-precision number for a data file: deterministic, no exponent roulette. */
export function dataNumber(value: number): string {
  if (!Number.isFinite(value)) return 'nan';
  // Ten significant digits is more than any solver reports and keeps the file
  // diffable: the same record always yields the same characters.
  return String(Number(value.toPrecision(10)));
}

function dataFileName(index: number): string {
  return index === 0 ? FIGURE_DAT_NAME : FIGURE_DAT_NAME.replace('.dat', `-${index + 1}.dat`);
}

/**
 * Build the figure, or `null` when there is nothing to plot.
 *
 * `null` is a fact, not a failure: a record with fewer than two mesh levels has
 * no refinement study, and the manuscript simply has no figure. Every other
 * absence — an invalid GCI, a synthetic solver — is stated in the caption
 * instead of being hidden by dropping the plot.
 */
export function figureFromSeries(
  series: readonly FigureSeries[],
  options: FigureOptions,
): Figure | null {
  if (series.length === 0) return null;
  if (series.every((entry) => entry.levels.length < 2)) return null;

  const { provenance, quantity, unit } = options;
  const quantityLabel = `${escapeLatex(quantity)}${escapeLatex(unitLabel(unit))}`;
  // Both panels exist for every series or for none: a groupplot has a fixed
  // grid, and a panel with no data would suggest a study that reported GCI
  // where none did.
  const hasGci = series.every((entry) => entry.gciByCells.length > 0);
  const multiSeries = series.length > 1;

  const dat = series.map((entry, index) => {
    const gciByCells = new Map(entry.gciByCells.map((point) => [point.cells, point.percent]));
    const rows = [...entry.levels]
      .sort((a, b) => a.cells - b.cells)
      .map((level) => {
        const gci = gciByCells.get(level.cells);
        return `${level.cells} ${dataNumber(level.value)} ${gci === undefined ? 'nan' : dataNumber(gci)}`;
      });
    return {
      name: dataFileName(index),
      // The first line is the header pgfplots reads, and it is the only line
      // that may be one: a `#` comment above it would be skipped, and the first
      // data row would silently become the column names. Provenance lives in
      // the `.tex` header, the caption and the render record, which hashes both
      // files.
      content: ['cells value gci_percent', ...rows, ''].join('\n'),
    };
  });

  const panels = dat.flatMap((file, index) => {
    const label = series[index]!.label;
    const plots = [
      [
        `    \\nextgroupplot[xlabel={Cell count}, ylabel={${quantityLabel}}]`,
        `      \\addplot table[x=cells, y=value, col sep=space, header=true] {${file.name}};`,
        ...(multiSeries ? [`      \\addlegendentry{${escapeLatex(label)}}`] : []),
      ],
    ];
    if (hasGci) {
      plots.push([
        '    \\nextgroupplot[xlabel={Cell count}, ylabel={GCI (\\%)}, unbounded coords=jump]',
        `      \\addplot table[x=cells, y=gci_percent, col sep=space, header=true] {${file.name}};`,
        ...(multiSeries ? [`      \\addlegendentry{${escapeLatex(label)}}`] : []),
      ]);
    }
    return plots;
  });

  const captionParts = [
    `${escapeLatex(quantity)}${escapeLatex(unitLabel(unit))} against cell count${
      hasGci ? ' (left) and Grid Convergence Index against cell count (right)' : ''
    }.`,
    `Provenance: run ${escapeLatex(provenance.runId)}, evidence record #${provenance.seq}, sha256 ${escapeLatex(
      provenance.payloadHash,
    )}.`,
  ];
  const artefact = provenance.artefacts?.[0];
  captionParts.push(
    artefact
      ? `The solver artefact ${escapeLatex(artefact.name)} hashes to ${escapeLatex(artefact.sha256)}.`
      : 'The evidence record lists no solver artefact.',
  );
  captionParts.push(...options.caveats.map((caveat) => escapeLatex(caveat)));

  const tex = [
    `% provenance: run ${provenance.runId}, evidence seq ${provenance.seq}, sha256 ${provenance.payloadHash}`,
    '% Generated from the cfd-run record by @aeroscribe/api; the plotted values are unchanged.',
    '\\begin{figure}[t]',
    '  \\centering',
    '  \\begin{tikzpicture}',
    '  \\begin{groupplot}[',
    `    group style={group size=${hasGci ? 2 : 1} by ${series.length}, horizontal sep=2.4cm},`,
    '    width=0.46\\linewidth,',
    '    height=0.34\\linewidth,',
    '    xmode=log,',
    '    grid=major,',
    '    tick label style={font=\\small},',
    '    label style={font=\\small},',
    multiSeries ? '    legend style={font=\\small, at={(0.5,-0.28)}, anchor=north},' : '',
    '  ]',
    ...panels.flat(),
    '  \\end{groupplot}',
    '  \\end{tikzpicture}',
    `  \\caption{${captionParts.join(' ')}}`,
    `  \\label{${FIGURE_LABEL}}`,
    '\\end{figure}',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    tex: { name: FIGURE_TEX_NAME, content: tex },
    dat,
    label: FIGURE_LABEL,
  };
}

/**
 * The study figure for a `cfd-run` record.
 *
 * The two GCI points Roache's three-grid procedure produces are placed at the
 * cell count of the finer grid of each pair — the fine pair's GCI at the fine
 * mesh, the medium pair's at the medium mesh. There is no third point, because
 * there is no coarser grid to compare the coarsest one with, and inventing one
 * would be exactly the kind of number this project refuses.
 */
export function cfdFigure(
  cfd: CfdEvidencePayload | null,
  provenance: FigureProvenance | null,
): Figure | null {
  if (!cfd) return null;
  if (!provenance) {
    throw new Error(
      'the figure cannot name its evidence: pass the cfd-run record seq and payload hash (the caption and header quote both)',
    );
  }

  const levels = cfd.gci?.levels ?? [];
  if (levels.length < 2) return null;

  const sorted = [...levels].sort((a, b) => b.cells - a.cells);
  const gciByCells: Array<{ cells: number; percent: number }> = [];
  if (cfd.gci?.valid) {
    const [fine, medium] = sorted;
    if (fine && cfd.gci.fineGciPercent !== null && Number.isFinite(cfd.gci.fineGciPercent)) {
      gciByCells.push({ cells: fine.cells, percent: cfd.gci.fineGciPercent });
    }
    if (medium && cfd.gci.mediumGciPercent !== null && Number.isFinite(cfd.gci.mediumGciPercent)) {
      gciByCells.push({ cells: medium.cells, percent: cfd.gci.mediumGciPercent });
    }
  }

  const caveats: string[] = [];
  if (cfd.solver === 'synthetic') {
    caveats.push(
      'The points come from the deterministic benchmark solver, not from solving the governing equations, so this figure is illustrative and must not be read as a physical result.',
    );
  }
  if (!cfd.gci?.valid) {
    caveats.push(
      `The grid study did not reach the asymptotic range${
        cfd.gci?.reason ? ` (${cfd.gci.reason})` : ''
      }, so no Grid Convergence Index is plotted and no interval is reported.`,
    );
  }

  return figureFromSeries(
    [
      {
        label: cfd.solver === 'synthetic' ? 'benchmark' : 'solver',
        levels,
        gciByCells,
      },
    ],
    {
      provenance: {
        ...provenance,
        ...(cfd.artefacts.length > 0 ? { artefacts: cfd.artefacts } : {}),
      },
      quantity: cfd.quantity,
      unit: cfd.unit,
      caveats,
    },
  );
}
