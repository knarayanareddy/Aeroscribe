import {
  DEFAULT_JOURNAL_TARGET,
  findJournalTarget,
  type JournalTarget,
} from '@aeroscribe/pipeline';
import { buildPolicy, verifyClaims } from '../claims/verify';
import { UnverifiableClaimError } from '../errors';
import type { StageHandler, StageOutcome } from './types';
import type { FramingPayload, LiteraturePayload, NoveltyPayload } from './research';
import type { CfdEvidencePayload } from './evidence';

export interface ManuscriptSectionText {
  heading: string;
  body: string;
}

export interface ManuscriptPayload {
  stage: 'paper-synthesis';
  title: string;
  journal: string;
  journalId: string;
  sections: ManuscriptSectionText[];
  abstract: string;
  wordCount: number;
  referenceCount: number;
  references: Array<{ index: number; citation: string; doi: string }>;
  numbers: Record<string, number>;
  generatedAt: string;
  /** True when any number came from the synthetic solver. */
  synthetic: boolean;
}

/** Round to a fixed number of significant digits and return a real number. */
export function quote(value: number, significantDigits = 4): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Number(value.toPrecision(significantDigits));
}

/**
 * Format a measurement for prose at a declared number of significant digits.
 *
 * The claim verifier accepts a printed value only when it is a correct rounding
 * of an evidence value at the precision shown, so the writer must never round
 * text separately from the policy it is checked against.
 */
export function formatMeasurement(value: number, significantDigits = 4): string {
  if (!Number.isFinite(value)) return 'n/a';
  return String(Number(value.toPrecision(significantDigits)));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatCitation(
  index: number,
  paper: { authors: string[]; year: number | null; title: string; doi: string | null },
): string {
  const authors =
    paper.authors.length > 0 ? paper.authors.slice(0, 3).join(', ') : 'Unknown authors';
  const year = paper.year ?? 'n.d.';
  return `[${index}] ${authors} (${year}). ${paper.title}. doi:${paper.doi ?? 'unresolved'}`;
}

/**
 * Stage 5 — paper synthesis.
 *
 * The writer is deliberately mechanical: every numeric value it prints is
 * rounded from an evidence record, then the finished text is run through the
 * claim verifier. If a single number or DOI cannot be traced, the stage throws
 * `UnverifiableClaimError` and no manuscript is registered. That failure mode is
 * the point of the stage, not an edge case.
 */
export const paperSynthesis: StageHandler = async (context): Promise<StageOutcome> => {
  const { run, registry, now } = context;
  const records = await registry.list({ runId: run.id });

  const literature = records.find((record) => record.kind === 'literature-search')?.payload as
    LiteraturePayload | undefined;
  const novelty = records.find((record) => record.kind === 'novelty-report')?.payload as
    NoveltyPayload | undefined;
  const framing = records
    .filter((record) => record.kind === 'stage-output')
    .map((record) => record.payload as FramingPayload)
    .find((payload) => payload.stage === 'contribution-framing');
  const cfd = records.find((record) => record.kind === 'cfd-run')?.payload as
    CfdEvidencePayload | undefined;

  if (!cfd) {
    throw new UnverifiableClaimError([
      'no CFD evidence record exists for this run; a results section would have nothing to quote',
    ]);
  }

  const journal: JournalTarget =
    findJournalTarget(framing?.journal ?? run.journal) ?? DEFAULT_JOURNAL_TARGET;
  const references = literature?.references ?? [];

  const value = quote(cfd.value);
  const uncertainty = quote(cfd.uncertainty || 0, 3);
  const valueText = formatMeasurement(cfd.value, 4);
  const uncertaintyText = formatMeasurement(cfd.uncertainty || 0, 3);
  const gciPercent =
    cfd.gci && cfd.gci.fineGciPercent !== null ? quote(cfd.gci.fineGciPercent, 3) : null;
  const apparentOrder = cfd.gci && cfd.gci.valid ? quote(cfd.gci.apparentOrder, 3) : null;
  const gciPercentText = gciPercent !== null ? formatMeasurement(gciPercent, 3) : null;
  const apparentOrderText = apparentOrder !== null ? formatMeasurement(apparentOrder, 3) : null;
  const verifiedReferences = references.length;
  const gaps = novelty?.gapCount ?? 0;
  const meshCount = cfd.gci?.levels.length ?? 0;

  const numbers: Record<string, number> = {
    value,
    uncertainty,
    ...(gciPercent !== null ? { gciPercent } : {}),
    ...(apparentOrder !== null ? { apparentOrder } : {}),
    verifiedReferences,
    gaps,
    meshCount,
  };

  const title = `${run.topic}: a verification-first computational study`;

  const abstractParts = [
    `This study reports a ${cfd.quantity} of ${valueText} ± ${uncertaintyText} for ${run.topic.toLowerCase()}.`,
    apparentOrderText !== null && gciPercentText !== null
      ? `The value was obtained on ${meshCount} systematically refined meshes; the observed order of accuracy is ${apparentOrderText} and the fine-grid Grid Convergence Index is ${gciPercentText} percent.`
      : 'The grid study did not reach the asymptotic range, so no uncertainty interval is reported.',
    `${verifiedReferences} DOI-verified references were retrieved and ${gaps} candidate gaps were identified.`,
  ];

  const abstract = abstractParts.join(' ');

  const sections: ManuscriptSectionText[] = [
    {
      heading: 'Introduction',
      body: `${framing?.statement ?? `This paper studies ${run.topic.toLowerCase()}.`} The analysis is restricted to numbers that are reconstructible from the evidence registry, and every reference in this draft resolved through a DOI registry at generation time.`,
    },
    {
      heading: 'Method',
      body: `The quantity of interest is the ${cfd.quantity}. It was computed with ${cfd.method} on ${meshCount} meshes. ${cfd.notes.join(' ')}`,
    },
    {
      heading: 'Results',
      body:
        apparentOrderText !== null && gciPercentText !== null
          ? `The extrapolated ${cfd.quantity} is ${valueText} ± ${uncertaintyText}. The observed order of accuracy is ${apparentOrderText} and the fine-grid Grid Convergence Index is ${gciPercentText} percent.`
          : `The computed ${cfd.quantity} is ${valueText}. The grid study was rejected (${cfd.gci?.reason ?? 'no reason recorded'}), so these values are reported without a convergence interval.`,
    },
    {
      heading: 'Discussion',
      body: `${verifiedReferences} references were retrieved and DOI-resolved for this run. ${gaps} topic terms were not covered by that literature. ${cfd.disclaimer ?? ''}`.trim(),
    },
    {
      heading: 'Conclusion',
      body: `Within the stated uncertainty, the ${cfd.quantity} is ${valueText} ± ${uncertaintyText}. All inputs, solver settings and checksums are recorded in the evidence registry for this run.`,
    },
    {
      heading: 'AI use disclosure',
      body: 'This draft was assembled by the AeroScribe pipeline, an automated writing system. The human author is responsible for every claim in the submitted manuscript, and no language model was used to generate or alter any numeric result: each value is copied from the evidence registry.',
    },
  ];

  const referenceLines = references.map((reference, index) => ({
    index: index + 1,
    citation: formatCitation(index + 1, reference),
    doi: reference.doi ?? '',
  }));

  const fullText = [
    title,
    abstract,
    ...sections.map((section) => `${section.heading}\n${section.body}`),
    ...referenceLines.map((line) => line.citation),
  ].join('\n\n');

  // Counts are derived from evidence by construction, and are declared to the
  // verifier so that "3 meshes" is never mistaken for a measurement.
  const policy = buildPolicy(records, {
    derived: [
      { value: verifiedReferences, source: 'literature.references.length' },
      { value: gaps, source: 'novelty.gapCount' },
      { value: meshCount, source: 'cfd.gci.levels.length' },
    ],
  });
  const report = verifyClaims(fullText, policy);
  if (!report.ok) {
    throw new UnverifiableClaimError(
      report.unbacked.map((claim) => `${claim.token} (${claim.reason}) in: ${claim.context}`),
    );
  }

  const payload: ManuscriptPayload = {
    stage: 'paper-synthesis',
    title,
    journal: journal.name,
    journalId: journal.id,
    sections,
    abstract,
    wordCount: wordCount(fullText),
    referenceCount: referenceLines.length,
    references: referenceLines,
    numbers,
    generatedAt: now().toISOString(),
    synthetic: cfd.solver === 'synthetic',
  };

  return {
    kind: 'manuscript',
    label: `Manuscript draft: ${title}`,
    summary: `${sections.length} sections, ${referenceLines.length} verified references, ${payload.wordCount} words. All ${report.checked} numeric claims traced to evidence.`,
    payload,
    metrics: {
      words: payload.wordCount,
      references: referenceLines.length,
      claimsChecked: report.checked,
    },
  };
};
