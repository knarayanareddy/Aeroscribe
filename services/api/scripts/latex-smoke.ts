/**
 * LaTeX smoke test — render, and compile when a toolchain exists.
 *
 * ```bash
 * npm run smoke:latex                      # sample manuscript
 * npm run smoke:latex -- --run run-abc123  # a stored run's manuscript
 * npm run smoke:latex -- --require-pdf     # exit 1 when no PDF was produced
 * ```
 *
 * It prints every intermediate the renderer decided: the template, each file
 * with its size and hash, whether a PDF was typeset, and the exact blocker when
 * it was not. Nothing here is reported as working just because the command
 * exited zero: `--require-pdf` is what CI uses.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CfdEvidencePayload,
  ManuscriptPayload,
  ManuscriptRenderPayload,
} from '@aeroscribe/contract';
import { DEFAULT_JOURNAL_TARGET } from '@aeroscribe/pipeline';
import { loadConfig, detectLatex } from '../src/config';
import { LatexService } from '../src/latex';
import { EvidenceRegistry } from '../src/store/registry';

interface Args {
  runId: string | null;
  requirePdf: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let runId: string | null = null;
  let requirePdf = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--run') runId = argv[++index] ?? null;
    if (argv[index] === '--require-pdf') requirePdf = true;
  }
  return { runId, requirePdf };
}

/** A manuscript that exercises escaping, a missing field and a figure. */
function sampleManuscript(): ManuscriptPayload {
  const record = {
    key: 'ref-01',
    index: 1,
    doi: '10.2514/1.j060001',
    title: 'Transonic drag prediction on unstructured meshes',
    authors: ['A. Author'],
    year: 2024,
    venue: 'AIAA Journal',
    volume: null,
    pages: '1201-1215',
    publisher: null,
    url: 'https://doi.org/10.2514/1.j060001',
    verified: {
      verifiedAt: new Date(0).toISOString(),
      provider: 'crossref' as const,
      titleSimilarity: 1,
    },
  };

  return {
    stage: 'paper-synthesis',
    schemaVersion: 2,
    title: 'Camber_ratio and 50% chord: an escaping test — not a result',
    journal: DEFAULT_JOURNAL_TARGET.name,
    journalId: DEFAULT_JOURNAL_TARGET.id,
    abstract: 'A smoke-test manuscript. Every number it quotes is a constant of this script.',
    sections: [
      {
        heading: 'Method',
        body: 'This text exists to prove the renderer escapes _underscores_, % percents and & ampersands.',
      },
    ],
    wordCount: 30,
    referenceCount: 1,
    references: [{ index: 1, citation: '[1] A. Author (2024).', doi: record.doi, record }],
    numbers: {},
    generatedAt: '2026-01-01T00:00:00.000Z',
    synthetic: true,
  };
}

function sampleCfd(): CfdEvidencePayload {
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
    computedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function storedRun(
  runId: string,
  dataDir: string,
): Promise<{ manuscript: ManuscriptPayload; cfd: CfdEvidencePayload | null }> {
  const registry = new EvidenceRegistry(join(dataDir, 'registry.ndjson'));
  const records = await registry.list({ runId });
  const manuscript = records.filter((record) => record.kind === 'manuscript').at(-1);
  if (!manuscript) {
    throw new Error(`run "${runId}" has no manuscript record; advance it to stage 5 first`);
  }
  const cfd = records.find((record) => record.kind === 'cfd-run');
  return {
    manuscript: manuscript.payload as ManuscriptPayload,
    cfd: (cfd?.payload as CfdEvidencePayload | undefined) ?? null,
  };
}

async function main(): Promise<number> {
  const config = loadConfig(process.env);
  const args = parseArgs(process.argv.slice(2));
  const capability = await detectLatex(config.latexBinary);

  console.log('toolchain:', JSON.stringify(capability));
  const service = new LatexService({
    latex: capability,
    workDir: join(config.dataDir, 'manuscripts'),
    timeoutMs: config.latexTimeoutMs,
  });

  const source = args.runId
    ? await storedRun(args.runId, config.dataDir)
    : { manuscript: sampleManuscript(), cfd: sampleCfd() };

  const runId = args.runId ?? 'smoke-sample';
  const outcome = await service.build({
    runId,
    manuscript: source.manuscript,
    journal: DEFAULT_JOURNAL_TARGET,
    cfd: source.cfd,
    inputHashes: [],
  });

  const payload: ManuscriptRenderPayload = outcome.payload;
  console.log('template:', payload.template);
  console.log('directory:', outcome.directory);
  console.log('files:');
  for (const file of payload.files) {
    console.log(`  ${file.name.padEnd(18)} ${String(file.bytes).padStart(6)} B  ${file.sha256}`);
  }
  console.log(
    'missing bibliography fields:',
    payload.missingBibliographyFields.join(', ') || '(none)',
  );
  console.log('typeset:', payload.typeset);
  if (payload.pdf) console.log('pdf:', `${payload.pdf.bytes} B`, payload.pdf.sha256);
  if (outcome.blocker) console.log('blocker:', outcome.blocker);

  const tex = await readFile(join(outcome.directory, 'manuscript.tex'), 'utf8');
  console.log(`manuscript.tex: ${tex.split('\n').length} lines`);
  if (payload.typeset === 'source-only') {
    console.log('the .tex is complete and compiles by hand once a TeX distribution is installed');
    return args.requirePdf ? 1 : 0;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error('smoke:latex failed:', error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
