import type { CfdEvidencePayload } from '@aeroscribe/contract';
import { escapeLatex } from './escape';

/**
 * One pgfplots figure per CFD study, with its data in a sibling `.dat` file.
 *
 * The data file holds the numbers exactly as the `cfd-run` record carries them;
 * LaTeX plots them, nothing rescales or smooths them. A synthetic run gets a
 * caption that says so — a plot is the easiest place in a paper to imply a
 * measurement that was never made.
 *
 * Backslashes are written with `String.raw` so the file contains what LaTeX
 * receives: an escaped `\\` inside a normal string is one careless edit away
 * from a line break in the middle of a command.
 */

export interface FigureFile {
  name: string;
  content: string;
}

export interface Figure {
  /** `figure-1.tex`, ready to `\input` from the body. */
  tex: FigureFile;
  /** `figure-1.dat`, `cells value` per mesh level. */
  dat: FigureFile;
  /** Label the caption defines, for a future `\ref`. */
  label: string;
}

/**
 * Build the study figure, or `null` when the record has no grid study.
 *
 * `null` is a fact, not a failure: a run that never produced a mesh study has
 * nothing to plot, and the manuscript simply has no figure.
 */
export function cfdFigure(cfd: CfdEvidencePayload | null): Figure | null {
  const levels = cfd?.gci?.levels ?? [];
  if (!cfd || levels.length < 2) return null;

  const label = 'fig:mesh-study';
  const synthetic = cfd.solver === 'synthetic';
  const sorted = [...levels].sort((a, b) => a.cells - b.cells);
  const unit = cfd.unit ? ` (${escapeLatex(cfd.unit)})` : '';
  const quantity = escapeLatex(cfd.quantity);

  const dat = [
    '# cells value — copied from the cfd-run record, in ascending cell count',
    ...sorted.map((level) => `${level.cells} ${level.value}`),
    '',
  ].join('\n');

  // No numbers in the caption: every digit a reader sees should come from the
  // verified body text, which already quotes the value and its uncertainty.
  const caption = synthetic
    ? `${quantity} against cell count. The points come from the deterministic benchmark solver, not from solving the governing equations, so this figure is illustrative and must not be read as a mesh-convergence result.`
    : `${quantity} against cell count, from the solver runs recorded in this run's evidence.`;

  const tex = [
    '% Generated from the cfd-run record; the plotted values are unchanged.',
    String.raw`\begin{figure}[t]`,
    String.raw`  \centering`,
    String.raw`  \begin{tikzpicture}`,
    String.raw`    \begin{axis}[`,
    String.raw`      width=0.78\linewidth,`,
    String.raw`      xlabel={Cells},`,
    `      ylabel={${quantity}${unit}},`,
    String.raw`      xmode=log,`,
    String.raw`      grid=major,`,
    String.raw`      legend pos=south west,`,
    String.raw`    ]`,
    String.raw`      \addplot table {figure-1.dat};`,
    `      \\addlegendentry{${synthetic ? 'benchmark' : 'solver'}}`,
    String.raw`    \end{axis}`,
    String.raw`  \end{tikzpicture}`,
    `  \\caption{${caption}}`,
    `  \\label{${label}}`,
    String.raw`\end{figure}`,
    '',
  ].join('\n');

  return {
    tex: { name: 'figure-1.tex', content: tex },
    dat: { name: 'figure-1.dat', content: dat },
    label,
  };
}
