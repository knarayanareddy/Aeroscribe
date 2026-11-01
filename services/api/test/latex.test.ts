// @vitest-environment node
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CfdEvidencePayload, ManuscriptPayload, ReferenceRecord } from '@aeroscribe/contract';
import { DEFAULT_JOURNAL_TARGET, JOURNAL_TARGETS } from '@aeroscribe/pipeline';
import { buildPolicy, verifyClaims } from '../src/claims/verify';
import { UpstreamError } from '../src/errors';
import { sha256 } from '../src/lib/canonical';
import {
  LatexService,
  NO_LATEX,
  bibliographyFrom,
  cfdFigure,
  figureFromSeries,
  type FigureSeries,
  compileLatex,
  escapeLatex,
  probeLatex,
  renderManuscript,
  stripLatex,
  templateIdFor,
  typesetBlocker,
} from '../src/latex';
import type { LatexCapability } from '@aeroscribe/contract';

/**
 * The LaTeX path.
 *
 * The only fakes here are the engine binaries: they write the files a real
 * `pdflatex` writes. Escaping, the document, the bibliography, the figure and
 * the service are the production code, and every assertion below is about a
 * property the PDF depends on.
 */

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aeroscribe-latex-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** A shell-free node script; `chmod 755` makes it executable. */
async function fakeBinary(name: string, body: string): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, `#!/usr/bin/env node\n${body}\n`, 'utf8');
  await chmod(path, 0o755);
  return path;
}

function reference(overrides: Partial<ReferenceRecord> = {}): ReferenceRecord {
  return {
    key: 'ref-01',
    index: 1,
    doi: '10.2514/1.j060001',
    title: 'Transonic drag prediction on unstructured meshes',
    authors: ['A. Author', 'B. Author'],
    year: 2024,
    venue: 'AIAA Journal',
    volume: '62',
    pages: '1201-1215',
    publisher: 'AIAA',
    url: 'https://doi.org/10.2514/1.j060001',
    verified: { verifiedAt: '2026-10-01T00:00:00.000Z', provider: 'crossref', titleSimilarity: 1 },
    ...overrides,
  };
}

function manuscript(overrides: Partial<ManuscriptPayload> = {}): ManuscriptPayload {
  const record = reference();
  return {
    stage: 'paper-synthesis',
    schemaVersion: 2,
    title: 'Transonic wing drag prediction: a verification-first study',
    journal: 'AIAA Journal',
    journalId: 'aiaa-journal',
    abstract:
      'This study reports a drag coefficient of 0.4264 with a fine-grid GCI of 0.000787 percent.',
    sections: [
      { heading: 'Introduction', body: 'The quantity of interest is the drag coefficient.' },
      { heading: 'Results', body: 'The extrapolated drag coefficient is 0.4264.' },
    ],
    wordCount: 24,
    referenceCount: 1,
    references: [{ index: 1, citation: '[1] A. Author (2024).', doi: record.doi ?? '', record }],
    numbers: { dragCoefficient: 0.4264 },
    generatedAt: '2026-10-30T10:00:00.000Z',
    synthetic: true,
    ...overrides,
  };
}

function cfdPayload(): CfdEvidencePayload {
  return {
    stage: 'evidence-generation',
    schemaVersion: 1,
    quantity: 'drag coefficient',
    unit: 'dimensionless',
    solver: 'synthetic',
    value: 0.4264,
    uncertainty: 0.00000336,
    method: 'synthetic analytic benchmark',
    notes: [],
    disclaimer: 'Synthetic solver: no Navier-Stokes equations were solved.',
    gci: {
      levels: [
        { level: 'coarse', cells: 125_000, value: 0.4381 },
        { level: 'medium', cells: 1_000_000, value: 0.4299 },
        { level: 'fine', cells: 8_000_000, value: 0.4271 },
      ],
      apparentOrder: 2,
      fineGciPercent: 0.000787,
      mediumGciPercent: 0.0031,
      asymptoticRatio: 1.01,
      valid: true,
    },
    artefacts: [],
    computedAt: '2026-10-30T09:00:00.000Z',
  };
}

const input = () => ({
  runId: 'run-1',
  manuscript: manuscript(),
  journal: DEFAULT_JOURNAL_TARGET,
  cfd: cfdPayload(),
  inputHashes: [
    { kind: 'manuscript' as const, seq: 5, sha256: 'abc' },
    // The figure quotes this record and its digest, so the render needs it.
    { kind: 'cfd-run' as const, seq: 4, sha256: 'def' },
  ],
});

/** One plotted study, for the multi-series case the pipeline does not produce yet. */
function series(): FigureSeries {
  return {
    label: 'benchmark',
    levels: [
      { cells: 125_000, value: 0.4381 },
      { cells: 1_000_000, value: 0.4299 },
      { cells: 8_000_000, value: 0.4271 },
    ],
    gciByCells: [
      { cells: 1_000_000, percent: 0.0031 },
      { cells: 8_000_000, percent: 0.000787 },
    ],
  };
}

/** Where a figure came from; the caption and the header both print it. */
const provenance = {
  runId: 'run-1',
  seq: 4,
  payloadHash: 'def',
  artefacts: [{ name: 'gci-study.json', sha256: 'a'.repeat(64) }],
};

describe('escaping', () => {
  it('escapes every character that would otherwise end a command', () => {
    expect(escapeLatex('50% of A_B & C#D $5 {x} ~ ^ \\ end')).toBe(
      '50\\% of A\\_B \\& C\\#D \\$5 \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{} end',
    );
  });

  it('turns a topic that is itself a command into literal text', () => {
    const escaped = escapeLatex('\\input{/etc/passwd}');
    expect(escaped).toBe('\\textbackslash{}input\\{/etc/passwd\\}');
    // The dangerous property: no live `\input` survives.
    expect(escaped).not.toMatch(/(^|[^a-z])\\input/);
  });

  it('does not corrupt the commands it emits', () => {
    // The bug this guards: chained replaces escape the braces of
    // `\textbackslash{}` and print the wrong glyph.
    expect(escapeLatex('\\')).toBe('\\textbackslash{}');
    expect(escapeLatex('a—b±c')).toBe('a---b$\\pm$c');
  });

  it('strips layout, commands and file names but keeps prose', () => {
    const tex = [
      '\\begin{axis}[width=0.8\\linewidth, xmode=log]',
      '\\addplot table {figure-gci.dat};',
      '\\end{axis}',
      'The value is 0.4264 with 50\\% confidence.',
    ].join('\n');

    const text = stripLatex(tex);
    expect(text).toContain('0.4264');
    expect(text).toContain('50% confidence');
    // Not a claim: a plot width, a file name, a key.
    expect(text).not.toMatch(/0\.8|figure-gci|axis/);
  });
});

describe('bibliography', () => {
  it('omits a field the record does not have and says so', () => {
    const { bib, missing } = bibliographyFrom([reference({ volume: null })]);
    expect(bib).toContain('@article{ref-01,');
    expect(bib).toContain('% missing: volume');
    expect(bib).not.toMatch(/volume = \{/);
    expect(missing).toEqual(['volume']);
  });

  it('uses @misc for a record with no venue, and never invents one', () => {
    const { bib } = bibliographyFrom([reference({ venue: null })]);
    expect(bib).toContain('@misc{ref-01,');
    expect(bib).not.toContain('journal = {');
  });

  it('escapes characters that would break the entry', () => {
    const { bib } = bibliographyFrom([reference({ title: 'Drag & lift at 50% camber' })]);
    expect(bib).toContain('title = {Drag \\& lift at 50\\% camber}');
  });
});

describe('figure', () => {
  it('plots the recorded mesh values and both GCI points', () => {
    const figure = cfdFigure(cfdPayload(), provenance)!;
    expect(figure.dat.map((file) => file.name)).toEqual(['figure-gci.dat']);

    const rows = figure.dat[0]!.content.split('\n').filter((line) => line.trim().length > 0);
    // The first line is the header pgfplots reads by name: a comment above it
    // would be skipped and the first data row would become the column names,
    // which is exactly how a real `pdflatex` run failed once.
    expect(rows[0]).toBe('cells value gci_percent');
    expect(rows).not.toContainEqual(expect.stringMatching(/^#/));
    // One row per mesh level, ascending cell count; the coarsest level has no
    // GCI of its own, because Roache's procedure produces one per grid pair.
    expect(rows.slice(1)).toEqual([
      '125000 0.4381 nan',
      '1000000 0.4299 0.0031',
      '8000000 0.4271 0.000787',
    ]);

    // Two panels: value against cells, then GCI against cells.
    expect(figure.tex.content).toContain('group size=2 by 1');
    expect(figure.tex.content).toContain('x=cells, y=value');
    expect(figure.tex.content).toContain('x=cells, y=gci_percent');
    expect(figure.tex.content).toContain('{figure-gci.dat}');
  });

  it('names the run, the record and the artefact digest in the source and caption', () => {
    const figure = cfdFigure(cfdPayload(), provenance)!;
    expect(figure.tex.content).toContain('% provenance: run run-1, evidence seq 4, sha256 def');
    expect(figure.tex.content).toContain('evidence record \\#4');
    expect(figure.tex.content).toContain('sha256 def');
    expect(figure.tex.content).toContain('gci-study.json');
    expect(figure.tex.content).toContain('a'.repeat(64));
    // The `.dat` is data only: pgfplots reads its first line as the column
    // header, so a provenance comment above it would silently become data. The
    // render record hashes the file instead, and the caption names the record.
    expect(figure.dat[0]!.content.startsWith('cells value gci_percent')).toBe(true);
  });

  it('escapes every # in the body, because a caption feeds a macro definition', () => {
    // A real `pdflatex` run failed here: `evidence record #4` inside \caption is
    // an "Illegal parameter number". Comments may carry a #; the body may not.
    const figure = cfdFigure(cfdPayload(), provenance)!;
    const body = figure.tex.content
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('%'))
      .join('\n');
    expect(body).not.toMatch(/(^|[^\\])#/);
  });

  it('says in the caption that a synthetic study is not a physical result', () => {
    const figure = cfdFigure(cfdPayload(), provenance)!;
    expect(figure.tex.content).toMatch(/benchmark solver/);
    expect(figure.tex.content).toMatch(/must not be read as a physical result/);
  });

  it('hashes the same twice: determinism is proven, not assumed', () => {
    const first = cfdFigure(cfdPayload(), provenance)!;
    const second = cfdFigure(cfdPayload(), provenance)!;
    expect(sha256(second.tex.content)).toBe(sha256(first.tex.content));
    expect(second.dat.map((file) => sha256(file.content))).toEqual(
      first.dat.map((file) => sha256(file.content)),
    );
  });

  it('draws a legend only when the figure holds more than one series', () => {
    const single = figureFromSeries([series()], {
      provenance,
      quantity: 'drag coefficient',
      unit: 'dimensionless',
      caveats: [],
    })!;
    expect(single.tex.content).not.toContain('\\addlegendentry');

    const two = figureFromSeries(
      [
        { ...series(), label: 'coarse-to-fine study' },
        { ...series(), label: 'second study' },
      ],
      { provenance, quantity: 'drag coefficient', unit: 'dimensionless', caveats: [] },
    )!;
    expect(two.dat.map((file) => file.name)).toEqual(['figure-gci.dat', 'figure-gci-2.dat']);
    expect(two.tex.content).toContain('group size=2 by 2');
    expect(two.tex.content).toContain('\\addlegendentry{coarse-to-fine study}');
    expect(two.tex.content).toContain('\\addlegendentry{second study}');
    expect(two.tex.content).toContain('{figure-gci-2.dat}');
  });

  it('renders the study and says in one sentence that it did not converge', () => {
    const invalid = {
      ...cfdPayload(),
      gci: {
        ...cfdPayload().gci!,
        valid: false,
        fineGciPercent: null,
        mediumGciPercent: null,
        reason: 'values oscillate with mesh refinement',
      },
    };
    const figure = cfdFigure(invalid, provenance)!;
    expect(figure.tex.content).toMatch(/did not reach the asymptotic range/);
    expect(figure.tex.content).toMatch(/no interval is reported/);
    // No GCI panel is drawn, because there is no GCI to draw: one panel, not an
    // empty axis that would imply a study that reported GCI.
    expect(figure.tex.content).not.toContain('y=gci_percent');
    expect(figure.tex.content).toContain('group size=1 by 1');
    // The mesh values are still plotted: an invalid study is still evidence.
    expect(figure.dat[0]!.content).toContain('125000 0.4381');
  });

  it('has no figure when the record has no study', () => {
    expect(cfdFigure(null, provenance)).toBeNull();
    expect(cfdFigure({ ...cfdPayload(), gci: null }, provenance)).toBeNull();
  });

  it('refuses to plot without the record the caption names', () => {
    expect(() => cfdFigure(cfdPayload(), null)).toThrow(/cannot name its evidence/);
  });

  it('prints the unit from the payload and no unit when it is dimensionless', () => {
    expect(cfdFigure(cfdPayload(), provenance)!.tex.content).toContain('ylabel={drag coefficient}');
    expect(cfdFigure({ ...cfdPayload(), unit: 'N' }, provenance)!.tex.content).toContain(
      'ylabel={drag coefficient (N)}',
    );
  });
});

describe('renderManuscript', () => {
  it('is deterministic: the same record renders the same bytes', () => {
    const first = renderManuscript(input());
    const second = renderManuscript(input());
    expect(second.texSha256).toBe(first.texSha256);
    expect(second.tex).toBe(first.tex);
    // The header carries the manuscript's own timestamp, not the wall clock.
    expect(first.tex).toContain('% manuscript generated_at: 2026-10-30T10:00:00.000Z');
  });

  it('names its inputs in the file, so the artefact carries its provenance', () => {
    const { tex } = renderManuscript(input());
    expect(tex).toContain('% run: run-1');
    expect(tex).toContain('% input manuscript #5: sha256=abc');
  });

  it('selects the template the journal declares', () => {
    const [aiaa, jpp, ast] = ['aiaa-journal', 'jpp', 'ast'].map((id) =>
      JOURNAL_TARGETS.find((journal) => journal.id === id)!,
    );
    expect(templateIdFor(aiaa!)).toBe('aiaa-style');
    expect(templateIdFor(jpp!)).toBe('aiaa-style');
    expect(templateIdFor(ast!)).toBe('elsevier-style');
    expect(() => templateIdFor({ ...aiaa!, latexTemplate: 'revtex4-2' })).toThrow(
      /no LaTeX template/,
    );
  });

  it('keeps the preamble out of the verifiable text', () => {
    const rendered = renderManuscript(input());
    expect(rendered.verifiableText).toContain('0.4264');
    // `compat=1.18` and `width=0.78\linewidth` live in the preamble/options and
    // must never be read as claims.
    expect(rendered.verifiableText).not.toMatch(/1\.18|0\.78/);
  });

  it('includes the figure only when there is a study', () => {
    const files = renderManuscript(input()).files.map((file) => file.name);
    expect(files).toContain('figure-gci.tex');
    expect(files).toContain('figure-gci.dat');
    expect(renderManuscript(input()).tex).toContain('\\input{figure-gci.tex}');
    expect(
      renderManuscript({ ...input(), cfd: null }).files.map((file) => file.name),
    ).not.toContain('figure-gci.tex');
  });

  it('loads the pgfplots library the two-panel figure needs', () => {
    expect(renderManuscript(input()).tex).toContain('\\usepgfplotslibrary{groupplots}');
  });

  it('leaves no unescaped # in the document, figure included', () => {
    // `#` is a macro parameter once it reaches \caption or a moving argument;
    // `evidence record #4` in the figure caption failed a real pdflatex run.
    const rendered = renderManuscript(input());
    for (const file of rendered.files) {
      const body = file.content
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('%'))
        .join('\n');
      expect(body, file.name).not.toMatch(/(^|[^\\])#/);
    }
  });
});

describe('toolchain detection', () => {
  it('reports configured-but-unavailable for a path that is not there', async () => {
    const capability = await probeLatex(join(directory, 'missing-pdflatex'));
    expect(capability).toMatchObject({
      configured: true,
      available: false,
      version: null,
    });
  });

  it('reads the version line of an engine that answers', async () => {
    const binary = await fakeBinary(
      'fake-pdflatex',
      "console.log('pdfTeX 3.141592653 (TeX Live 2024)');",
    );
    const capability = await probeLatex(binary);
    expect(capability).toMatchObject({
      configured: true,
      available: true,
      version: 'pdfTeX 3.141592653 (TeX Live 2024)',
    });
  });

  it('treats a binary that says nothing as unavailable', async () => {
    const binary = await fakeBinary('silent-pdflatex', 'process.exit(0);');
    expect(await probeLatex(binary)).toMatchObject({ available: false, version: null });
  });

  it('does not hang on an engine that never answers', async () => {
    const binary = await fakeBinary('slow-pdflatex', 'setTimeout(() => {}, 60_000);');
    const capability = await probeLatex(binary, { timeoutMs: 300 });
    expect(capability.available).toBe(false);
  });
});

describe('compiling', () => {
  /** A fake engine that writes a small PDF, like the real one would. */
  async function pdfEngine(name = 'pdf-engine', body = ''): Promise<string> {
    return fakeBinary(
      name,
      `const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('pdfTeX 3.141592653 (fake)');
  process.exit(0);
}
if (fs.existsSync('manuscript.tex')) {
  fs.writeFileSync('manuscript.pdf', Buffer.from('%PDF-1.4 fake'));
}
console.log('This is pdfTeX, Version 3.141592653');
${body}
process.exit(0);`,
    );
  }

  async function workDir(): Promise<string> {
    const dir = join(directory, 'work');
    await writeFile(join(dir, 'manuscript.tex'), '\\documentclass{article}', 'utf8').catch(
      async () => {
        const { mkdir } = await import('node:fs/promises');
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'manuscript.tex'), '\\documentclass{article}', 'utf8');
      },
    );
    return dir;
  }

  it('returns the PDF it wrote, with its size and hash', async () => {
    const binary = await pdfEngine();
    const dir = await workDir();
    const result = await compileLatex({ binary, workDir: dir, passes: 1 });
    expect(result.bytes).toBe(Buffer.from('%PDF-1.4 fake').length);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.passes).toBe(1);
  });

  it('reports the engine log when it exits non-zero', async () => {
    const binary = await fakeBinary(
      'failing-engine',
      "console.log('! LaTeX Error: File aiaa-tc.cls not found.');\nprocess.exit(1);",
    );
    const dir = await workDir();
    await expect(compileLatex({ binary, workDir: dir, passes: 1 })).rejects.toThrow(UpstreamError);
    await expect(compileLatex({ binary, workDir: dir, passes: 1 })).rejects.toThrow(
      /File aiaa-tc\.cls not found/,
    );
  });

  it('fails when the engine exits cleanly but writes no PDF', async () => {
    const binary = await fakeBinary('no-pdf-engine', 'process.exit(0);');
    const dir = await workDir();
    await expect(compileLatex({ binary, workDir: dir, passes: 1 })).rejects.toThrow(
      /wrote no manuscript\.pdf/,
    );
  });

  it('rejects a file that is named .pdf but is not one', async () => {
    // An engine wrapper that exits 0 after writing a text file must not be
    // reported as a typeset manuscript: the route would then serve it as
    // `application/pdf` and the reviewer's viewer would fail to open it.
    const binary = await fakeBinary(
      'not-a-pdf-engine',
      "require('node:fs').writeFileSync('manuscript.pdf', 'sorry, this is not a PDF');",
    );
    const dir = await workDir();
    await expect(compileLatex({ binary, workDir: dir, passes: 1 })).rejects.toThrow(
      /does not begin with "%PDF-"/,
    );
  });

  it('kills an engine that exceeds its limit', async () => {
    const binary = await fakeBinary('slow-engine', 'setTimeout(() => {}, 60_000);');
    const dir = await workDir();
    await expect(compileLatex({ binary, workDir: dir, passes: 1, timeoutMs: 300 })).rejects.toThrow(
      /wall-clock limit/,
    );
  });
});

describe('claims on the rendered text', () => {
  /** One evidence record carrying a single number. */
  const records = (value: number) =>
    [
      {
        seq: 4,
        id: 'id',
        kind: 'cfd-run' as const,
        runId: 'run-1',
        stageId: 4,
        label: 'cfd',
        createdAt: '2026-10-30T09:00:00.000Z',
        payloadHash: 'x',
        prevHash: 'y',
        payload: { value },
        hash: 'z',
      },
    ] as const;

  it('checks the text a reader will see, not the payload alone', () => {
    const rendered = renderManuscript({
      ...input(),
      manuscript: manuscript({ abstract: 'The drag coefficient is 0.4264.' }),
    });
    const report = verifyClaims(rendered.verifiableText, buildPolicy(records(0.4264)));
    expect(report.ok).toBe(true);
  });

  it('refuses a number that no record backs', () => {
    const rendered = renderManuscript({
      ...input(),
      manuscript: manuscript({ abstract: 'The drag coefficient is 0.99.' }),
    });
    const report = verifyClaims(rendered.verifiableText, buildPolicy(records(0.4264)));
    expect(report.ok).toBe(false);
    expect(report.unbacked.map((claim) => claim.token)).toContain('0.99');
  });
});

describe('LatexService', () => {
  const capability = (overrides: Partial<LatexCapability> = {}): LatexCapability => ({
    configured: true,
    binary: '/usr/bin/pdflatex',
    available: true,
    version: 'pdfTeX 3.141592653',
    ...overrides,
  });

  it('writes the source and reports source-only when no engine is configured', async () => {
    const service = new LatexService({ latex: NO_LATEX, workDir: directory });
    const outcome = await service.build(input());

    expect(outcome.payload.typeset).toBe('source-only');
    expect(outcome.payload.pdf).toBeNull();
    expect(outcome.payload.toolchain).toBeNull();
    expect(outcome.blocker).toBe('the manuscript PDF was not typeset (LATEX_BINARY is not set)');

    const tex = await readFile(join(directory, 'run-1', 'manuscript.tex'), 'utf8');
    expect(tex).toBe(outcome.rendered.tex);
    expect(outcome.payload.files.map((file) => file.name)).toEqual([
      'manuscript.tex',
      'references.bib',
      'figure-gci.tex',
      'figure-gci.dat',
    ]);
  });

  it('names the binary when it is configured but unusable', () => {
    expect(
      typesetBlocker(capability({ available: false, binary: '/opt/tex/pdflatex', version: null })),
    ).toBe(
      'the manuscript PDF was not typeset (LATEX_BINARY points at "/opt/tex/pdflatex", which did not answer --version)',
    );
  });

  it('typesets when an engine is available, and serves the recorded bytes', async () => {
    const binary = await fakeBinary(
      'ok-engine',
      `const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('pdfTeX 3.141592653 (fake)'); process.exit(0); }
if (fs.existsSync('manuscript.tex')) fs.writeFileSync('manuscript.pdf', Buffer.from('%PDF-1.4 fake'));
process.exit(0);`,
    );

    const service = new LatexService({
      latex: capability({ binary }),
      workDir: directory,
      passes: 1,
    });
    const outcome = await service.build(input());

    expect(outcome.payload.typeset).toBe('pdf');
    expect(outcome.payload.pdf?.bytes).toBe(Buffer.from('%PDF-1.4 fake').length);
    expect(outcome.payload.toolchain).toEqual({ binary, version: 'pdfTeX 3.141592653' });
    expect(outcome.blocker).toBeNull();

    const pdf = await service.read('run-1', 'pdf');
    expect(pdf.kind).toBe('pdf');
    if (pdf.kind === 'pdf') expect(pdf.sha256).toBe(outcome.payload.pdf?.sha256);
  });

  it('refuses to serve a PDF it never wrote', async () => {
    const service = new LatexService({ latex: NO_LATEX, workDir: directory });
    await service.build(input());
    await expect(service.read('run-1', 'pdf')).rejects.toThrow(/no typeset PDF/);
  });

  it('keeps run ids out of the path', async () => {
    const service = new LatexService({ latex: NO_LATEX, workDir: directory });
    await service.build({ ...input(), runId: '../../etc/passwd' });
    const path = service.directoryFor('../../etc/passwd');
    // Nothing in the name can climb out of the work directory.
    expect(path.startsWith(directory)).toBe(true);
    expect(path).toBe(join(directory, '______etc_passwd'));
  });
});
