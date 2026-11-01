import {
  DEFAULT_JOURNAL_TARGET,
  findJournalTarget,
  type JournalTarget,
} from '@aeroscribe/pipeline';
import { buildPolicy, verifyClaims } from '../claims/verify';
import { UnverifiableClaimError } from '../errors';
import { readReferences, type ReferenceRecord } from '../literature';
import type { StageHandler, StageOutcome } from './types';
import type { FramingPayload, LiteraturePayload, NoveltyPayload, TopicPayload } from './research';
import type { CfdEvidencePayload } from './evidence';
import { formatAiaa, renderedCitation, validateCitations } from './citation';
import { buildPlan, planFacts, renderPlan, type PlanNumber } from './plan';

import type {
  ManuscriptPayload,
  ManuscriptPlanPayload,
  ManuscriptReference,
  ManuscriptSectionText,
} from '@aeroscribe/contract';

// The payload shapes are the wire contract; re-exported so the stage catalogue
// and the tests keep importing them from the agent that produces them.
export type {
  ManuscriptPayload,
  ManuscriptReference,
  ManuscriptSectionText,
  ManuscriptPlanPayload,
};

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

/**
 * Render a reference line in AIAA form (RULE-032).
 *
 * Delegates to `agents/citation.ts`, which is the only place a bibliography
 * string is assembled. A field the record does not carry is omitted there and
 * reported in `FormattedCitation.missing` — this function never substitutes a
 * placeholder that a reader could mistake for a fact.
 */
export function formatCitation(index: number, reference: ReferenceRecord): string {
  return formatAiaa({ ...reference, index }).text;
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
  // Stage 0 declares the numbers that belong to the research question itself.
  const topic = records
    .map((record) => record.payload as TopicPayload)
    .find((payload) => payload.stage === 'topic-intelligence');
  const topicNumbers = topic?.topicNumbers ?? [];
  const cfd = records.find((record) => record.kind === 'cfd-run')?.payload as
    CfdEvidencePayload | undefined;

  if (!cfd) {
    throw new UnverifiableClaimError([
      'no CFD evidence record exists for this run; a results section would have nothing to quote',
    ]);
  }

  const journal: JournalTarget =
    findJournalTarget(framing?.journal ?? run.journal) ?? DEFAULT_JOURNAL_TARGET;
  // `readReferences` accepts both payload versions: a manuscript re-rendered from
  // an older run must not lose its bibliography or silently invent titles.
  const references = readReferences(literature);

  const value = quote(cfd.value);
  const uncertainty = quote(cfd.uncertainty || 0, 3);
  const gciPercent =
    cfd.gci && cfd.gci.fineGciPercent !== null ? quote(cfd.gci.fineGciPercent, 3) : null;
  const apparentOrder = cfd.gci && cfd.gci.valid ? quote(cfd.gci.apparentOrder, 3) : null;
  const verifiedReferences = references.length;
  const gaps = novelty?.gapCount ?? 0;
  const meshCount = cfd.gci?.levels.length ?? 0;

  /**
   * Every number the prose may print, in one table.
   *
   * A plan paragraph declares the keys it is allowed to use, and the renderer
   * refuses a key that was not declared — so a number cannot reach the text
   * without both a name and a value taken from evidence. The two framing counts
   * are here because the contribution statement (written by stage 3) quotes
   * them; leaving them out would make the plan's check fail on prose this
   * writer did not compose.
   */
  const numbers: Record<string, PlanNumber> = {
    ...Object.fromEntries(
      topicNumbers.map((entry, index) => [
        `topicNumber${index + 1}`,
        { value: entry, text: String(entry) },
      ]),
    ),
    value: { value, text: formatMeasurement(cfd.value, 4) },
    uncertainty: { value: uncertainty, text: formatMeasurement(cfd.uncertainty || 0, 3) },
    ...(gciPercent !== null
      ? { gciPercent: { value: gciPercent, text: formatMeasurement(gciPercent, 3) } }
      : {}),
    ...(apparentOrder !== null
      ? { apparentOrder: { value: apparentOrder, text: formatMeasurement(apparentOrder, 3) } }
      : {}),
    verifiedReferences: { value: verifiedReferences, text: String(verifiedReferences) },
    gaps: { value: gaps, text: String(gaps) },
    meshCount: { value: meshCount, text: String(meshCount) },
    ...(framing
      ? {
          framingVerifiedReferences: {
            value: framing.evidenceBasis.verifiedReferences,
            text: String(framing.evidenceBasis.verifiedReferences),
          },
          framingGapCount: {
            value: framing.evidenceBasis.gaps,
            text: String(framing.evidenceBasis.gaps),
          },
        }
      : {}),
  };

  const facts = planFacts(cfd, framing, topicNumbers);
  const plan = buildPlan({
    runId: run.id,
    journal,
    records,
    facts,
    generatedAt: now().toISOString(),
  });

  // The plan is written first, as its own record, and the manuscript points at
  // it. Doing it the other way round would let a reader receive text whose plan
  // had never been committed — the hierarchy would be a story about the code.
  const planRecord = await registry.append({
    kind: 'manuscript-plan',
    runId: run.id,
    stageId: context.stage.id,
    label: `Manuscript plan: ${run.topic}`,
    payload: plan,
  });

  const sections: ManuscriptSectionText[] = renderPlan(plan, {
    topic: run.topic,
    cfd,
    numbers,
    framing,
    notes: facts.quotableNotes,
    disclaimer: facts.quotableDisclaimer,
  });

  const title = `${run.topic}: a verification-first computational study`;

  const valueText = numbers['value']!.text;
  const uncertaintyText = numbers['uncertainty']!.text;
  const abstractParts = [
    `This study reports a ${cfd.quantity} of ${valueText} ± ${uncertaintyText} for ${run.topic.toLowerCase()}.`,
    facts.gciValid && numbers['apparentOrder'] && numbers['gciPercent']
      ? `The value was obtained on ${numbers['meshCount']!.text} systematically refined meshes; the observed order of accuracy is ${numbers['apparentOrder'].text} and the fine-grid Grid Convergence Index is ${numbers['gciPercent'].text} percent.`
      : 'The grid study did not reach the asymptotic range, so no uncertainty interval is reported.',
    `${numbers['verifiedReferences']!.text} DOI-verified ${
      numbers['verifiedReferences']!.value === 1 ? 'reference was' : 'references were'
    } retrieved and ${numbers['gaps']!.text} ${
      numbers['gaps']!.value === 1 ? 'candidate gap was' : 'candidate gaps were'
    } identified.`,
  ];

  const abstract = abstractParts.join(' ');

  // Every reference is set in AIAA form, then parsed back: a field that the
  // formatter drops has to fail here, not in a reader's bibliography.
  const validation = validateCitations(references);
  if (!validation.ok) {
    throw new Error(
      `AIAA citation formatting lost recorded fields (RULE-032): ${validation.problems.join('; ')}`,
    );
  }

  const referenceLines: ManuscriptReference[] = references.map((reference, index) => ({
    index: index + 1,
    citation: formatCitation(index + 1, reference),
    doi: reference.doi ?? '',
    record: reference,
  }));

  // The verifier reads the prose, not the bibliography. A reference line is
  // bibliographic metadata — a year, a volume, a page range — rendered from a
  // DOI-verified record, and RULE-002/032 are what validate it. Treating `2024`
  // in a citation as a quantitative claim would force the writer to declare
  // other people's publication years as its own results.
  const prose = [
    title,
    abstract,
    ...sections.map((section) => `${section.heading}\n${section.body}`),
  ].join('\n\n');

  const fullText = [prose, ...referenceLines.map((line) => line.citation)].join('\n\n');

  // Counts are derived from evidence by construction, and are declared to the
  // verifier so that "3 meshes" is never mistaken for a measurement.
  const policy = buildPolicy(records, {
    derived: [
      { value: verifiedReferences, source: 'literature.references.length' },
      { value: gaps, source: 'novelty.gapCount' },
      { value: meshCount, source: 'cfd.gci.levels.length' },
    ],
  });
  const report = verifyClaims(prose, policy);
  if (!report.ok) {
    throw new UnverifiableClaimError(
      report.unbacked.map((claim) => `${claim.token} (${claim.reason}) in: ${claim.context}`),
    );
  }

  const payload: ManuscriptPayload = {
    stage: 'paper-synthesis',
    schemaVersion: 2,
    title,
    journal: journal.name,
    journalId: journal.id,
    sections,
    abstract,
    wordCount: wordCount(fullText),
    referenceCount: referenceLines.length,
    references: referenceLines,
    numbers: Object.fromEntries(Object.entries(numbers).map(([key, entry]) => [key, entry.value])),
    // The payload hash, not the chain hash: a reader can recompute it from the
    // plan payload alone, without the whole registry.
    planRef: { seq: planRecord.seq, hash: planRecord.payloadHash },
    citations: references.map((reference) => renderedCitation(reference)),
    generatedAt: plan.generatedAt,
    synthetic: cfd.solver === 'synthetic',
  };

  const planned = plan.sections.reduce((total, section) => total + section.paragraphs.length, 0);

  return {
    kind: 'manuscript',
    label: `Manuscript draft: ${title}`,
    summary: `${sections.length} sections from a ${planned}-paragraph plan, ${referenceLines.length} AIAA-formatted references, ${payload.wordCount} words. All ${report.checked} numeric claims traced to evidence.`,
    payload,
    metrics: {
      words: payload.wordCount,
      references: referenceLines.length,
      claimsChecked: report.checked,
      plannedParagraphs: planned,
      planSeq: planRecord.seq,
    },
  };
};
