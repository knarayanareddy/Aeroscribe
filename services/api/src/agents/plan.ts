import type { JournalTarget } from '@aeroscribe/pipeline';
import type {
  CfdEvidencePayload,
  ManuscriptParagraph,
  ManuscriptPayload,
  ManuscriptPlanPayload,
  ManuscriptPlanSection,
  ManuscriptSectionText,
  PlannedParagraph,
} from '@aeroscribe/contract';
import { extractNumericTokens, significantDigits } from '../claims/extract';
import type { EvidenceRecord } from '../store';

/**
 * The manuscript plan — RULE-030's hierarchy, as an artefact.
 *
 * "Hierarchical generation" is usually a claim about prompt structure: a hidden
 * outline that nothing can inspect. Here it is the opposite. `buildPlan` writes
 * the structure down as its own evidence record *before* any prose exists, stage
 * 5 renders prose only through `renderPlan`, and stage 6 compares the text with
 * the plan by paragraph id. A plan that is not obeyed is a review finding, not a
 * silent difference of opinion.
 *
 * Everything here is deterministic: sections follow the journal's `sectionOrder`,
 * paragraph ids are positional, and no text is produced without a declared
 * intent. Running the same evidence twice yields the same plan, byte for byte.
 */

/** A number the manuscript may print, with the digits this writer prints. */
export interface PlanNumber {
  value: number;
  /** The exact string the prose shows; the plan check compares values, not text. */
  text: string;
}

/** Facts about the run that decide which paragraphs exist. */
export interface PlanFacts {
  /** The framing record's contribution statement exists (stage 3 ran). */
  hasFraming: boolean;
  /** The grid study is valid, so an uncertainty interval may be quoted. */
  gciValid: boolean;
  /** Number of mesh levels; 0 when the record carries no study. */
  meshCount: number;
  /** The run used the synthetic solver. */
  synthetic: boolean;
  /** Solver notes that contain no numerals and may be quoted verbatim. */
  quotableNotes: string[];
  /** A disclaimer the record carries, when it is digit-free. */
  quotableDisclaimer: string | null;
  /**
   * Keys for the numbers that are part of the research question itself
   * (`Mach 0.78`). Stage 0 declared them as given, so a paragraph that quotes
   * the topic may print them — and must declare that it does.
   */
  topicNumberKeys: string[];
}

/**
 * A numeral is anything the claim extractor would see as a number. Free-text
 * evidence is quoted only when it has none: a paragraph's numbers must all be
 * keys of the numbers table, and quoting arbitrary text would make that check
 * vacuous.
 */
const NUMERAL = /\d/;

export function hasNumeral(text: string): boolean {
  return NUMERAL.test(text);
}

function latestOf(records: readonly EvidenceRecord[], kind: string): EvidenceRecord | undefined {
  return [...records].reverse().find((record) => record.kind === kind);
}

function ref(record: EvidenceRecord | undefined): string[] {
  return record ? [`${record.kind}#${record.seq}`] : [];
}

/** Read the facts the plan depends on, without inventing any. */
export function planFacts(
  cfd: CfdEvidencePayload | undefined,
  framing: { statement?: string } | undefined,
  topicNumbers: readonly number[] = [],
): PlanFacts {
  const notes = cfd?.notes ?? [];
  return {
    hasFraming: typeof framing?.statement === 'string' && framing.statement.length > 0,
    gciValid: cfd?.gci?.valid === true,
    meshCount: cfd?.gci?.levels.length ?? 0,
    synthetic: cfd?.solver === 'synthetic',
    // A note is quoted only when it carries no numeral: every number in a
    // planned paragraph must trace to the numbers table, and free text would
    // make that check unfalsifiable. Notes that do quote numbers stay in the
    // record, where the Results section reproduces them in structured form.
    quotableNotes: notes.filter((note) => !hasNumeral(note)),
    quotableDisclaimer: cfd?.disclaimer && !hasNumeral(cfd.disclaimer) ? cfd.disclaimer : null,
    topicNumberKeys: topicNumbers.map((_, index) => `topicNumber${index + 1}`),
  };
}

/** One planned paragraph, in the shape the contract stores. */
function paragraph(
  id: string,
  intent: string,
  evidenceRefs: string[],
  numberKeys: string[],
  targetWords: number,
): PlannedParagraph {
  return { id, intent, evidenceRefs, numberKeys, targetWords };
}

export interface PlanBuildInput {
  runId: string;
  journal: JournalTarget;
  records: readonly EvidenceRecord[];
  facts: PlanFacts;
  /** The run clock; a re-render of the same run keeps the same timestamp. */
  generatedAt: string;
}

/**
 * Build the plan: paper architecture, sections in journal order, one paragraph
 * per job. No LLM is involved and none is simulated — the structure is a
 * function of the evidence the run already holds.
 */
export function buildPlan(input: PlanBuildInput): ManuscriptPlanPayload {
  const { journal, facts, records } = input;
  const cfdRecord = latestOf(records, 'cfd-run');
  const framingRecord = [...records]
    .reverse()
    .find(
      (record) =>
        record.kind === 'stage-output' &&
        (record.payload as { stage?: string }).stage === 'contribution-framing',
    );
  const topicRecord = [...records]
    .reverse()
    .find(
      (record) =>
        record.kind === 'stage-output' &&
        (record.payload as { stage?: string }).stage === 'topic-intelligence',
    );
  const literatureRecord = latestOf(records, 'literature-search');
  const noveltyRecord = latestOf(records, 'novelty-report');

  const sections: ManuscriptPlanSection[] = [];

  const purposes: Record<string, string> = {
    Introduction: 'State the problem and the verification stance this paper takes.',
    Method: 'Say how the quantity was computed and on what meshes.',
    Results: 'Quote the value, its uncertainty and the grid study.',
    Discussion: 'Place the result against the literature the run actually retrieved.',
    Conclusion: 'Restate the result within the uncertainty it carries.',
    'AI use disclosure': 'Declare the automated writing system, as RULE-004 requires.',
  };

  for (const heading of journal.sectionOrder) {
    if (heading === 'Introduction') {
      sections.push({
        heading,
        purpose: purposes[heading]!,
        paragraphs: [
          // The topic carries the research question's own numbers ("Mach 0.78");
          // quoting it is only allowed because stage 0 declared them.
          paragraph(
            'p-introduction-1',
            'introduction-problem',
            ref(topicRecord),
            facts.topicNumberKeys,
            30,
          ),
          paragraph(
            'p-introduction-2',
            // With a framing record the paragraph prints that record's counts;
            // without one it states the verification stance instead.
            facts.hasFraming ? 'introduction-contribution' : 'introduction-policy',
            facts.hasFraming ? ref(framingRecord) : [],
            facts.hasFraming ? ['framingVerifiedReferences', 'framingGapCount'] : [],
            45,
          ),
        ],
      });
      continue;
    }

    if (heading === 'Method') {
      const methodParagraphs = [
        paragraph(
          'p-method-1',
          'method-quantity',
          ref(cfdRecord),
          facts.meshCount > 0 ? ['meshCount'] : [],
          45,
        ),
      ];
      if (facts.quotableNotes.length > 0) {
        methodParagraphs.push(paragraph('p-method-2', 'method-notes', ref(cfdRecord), [], 35));
      }
      sections.push({ heading, purpose: purposes[heading]!, paragraphs: methodParagraphs });
      continue;
    }

    if (heading === 'Results') {
      sections.push({
        heading,
        purpose: purposes[heading]!,
        paragraphs: [
          paragraph(
            'p-results-1',
            'results-value',
            ref(cfdRecord),
            facts.gciValid ? ['value', 'uncertainty'] : ['value'],
            30,
          ),
          paragraph(
            'p-results-2',
            facts.gciValid ? 'results-grid' : 'results-grid-rejected',
            ref(cfdRecord),
            facts.gciValid ? ['apparentOrder', 'gciPercent', 'meshCount'] : [],
            40,
          ),
        ],
      });
      continue;
    }

    if (heading === 'Discussion') {
      const discussionParagraphs = [
        paragraph(
          'p-discussion-1',
          'discussion-literature',
          ref(literatureRecord),
          ['verifiedReferences'],
          30,
        ),
        paragraph('p-discussion-2', 'discussion-gaps', ref(noveltyRecord), ['gaps'], 30),
      ];
      if (facts.synthetic) {
        discussionParagraphs.push(
          paragraph('p-discussion-3', 'discussion-synthetic', ref(cfdRecord), [], 35),
        );
      } else if (facts.quotableDisclaimer) {
        discussionParagraphs.push(
          paragraph('p-discussion-3', 'discussion-disclaimer', ref(cfdRecord), [], 35),
        );
      }
      sections.push({
        heading,
        purpose: purposes[heading]!,
        paragraphs: discussionParagraphs,
      });
      continue;
    }

    if (heading === 'Conclusion') {
      sections.push({
        heading,
        purpose: purposes[heading]!,
        paragraphs: [
          paragraph(
            'p-conclusion-1',
            'conclusion-value',
            ref(cfdRecord),
            facts.gciValid ? ['value', 'uncertainty'] : ['value'],
            30,
          ),
          paragraph('p-conclusion-2', 'conclusion-provenance', ref(cfdRecord), [], 25),
        ],
      });
      continue;
    }

    // A journal section this writer has no paragraph for is a configuration
    // error: inventing a generic paragraph would put text in the manuscript that
    // nothing in the plan asked for.
    throw new Error(
      `no planned paragraphs for the journal section "${heading}" of ${journal.id}; add them to agents/plan.ts rather than emitting unplanned text`,
    );
  }

  sections.push({
    heading: 'AI use disclosure',
    purpose: purposes['AI use disclosure']!,
    paragraphs: [paragraph('p-disclosure-1', 'disclosure', [], [], 60)],
  });

  return {
    stage: 'plan',
    // The kind is new in G, so its first version is 1. (The roadmap sketched
    // `schemaVersion: 2`; numbering a first version 2 would imply a version 1
    // that never existed.)
    schemaVersion: 1,
    runId: input.runId,
    journalId: journal.id,
    architecture: `Journal article for ${journal.name}: ${journal.sectionOrder.join(' → ')}, ${
      journal.citationStyle
    } citations, a ${journal.abstractWordLimit}-word abstract limit, plan written before the text.`,
    sections,
    generatedAt: input.generatedAt,
  };
}

/* ───────────────────────────── the projection ────────────────────────────── */

export interface RenderPlanContext {
  topic: string;
  cfd: CfdEvidencePayload;
  numbers: Record<string, PlanNumber>;
  framing?: { statement?: string } | undefined;
  notes: string[];
  disclaimer: string | null;
}

/**
 * One paragraph's worth of context, bound to the paragraph that is being
 * rendered.
 *
 * `number()` refuses a key the plan did not declare for this paragraph. That is
 * what keeps "text is a projection of the plan" true at write time instead of
 * relying on the reviewer to catch it afterwards.
 */
interface BoundContext extends RenderPlanContext {
  declared: ReadonlySet<string>;
  /** The printed form of a declared number: `3`, `0.4264`. */
  number(key: string): string;
  /**
   * The printed form plus an agreeing noun: `1 topic term was`, `2 topic terms
   * were`. Grammar is the one place a count changes a sentence, and it goes
   * through the same declaration check as the number itself.
   */
  count(key: string, one: string, many: string): string;
}

function bind(context: RenderPlanContext, paragraph: PlannedParagraph): BoundContext {
  const declared = new Set(paragraph.numberKeys);
  return {
    ...context,
    declared,
    number(key: string): string {
      return require(key).text;
    },
    count(key: string, one: string, many: string): string {
      const entry = require(key);
      return `${entry.text} ${entry.value === 1 ? one : many}`;
    },
  };

  function require(key: string): PlanNumber {
    if (!declared.has(key)) {
      throw new Error(
        `paragraph ${paragraph.id} printed "${key}" but its plan declares [${paragraph.numberKeys.join(
          ', ',
        )}]; add the key to the plan or drop the number from the text`,
      );
    }
    const entry = context.numbers[key];
    if (!entry) {
      throw new Error(
        `paragraph ${paragraph.id} declares "${key}" but the numbers table has no such entry`,
      );
    }
    return entry;
  }
}

const SYNTHETIC_METHOD =
  'the deterministic synthetic benchmark solver, which does not solve the governing equations';

const INTENTS: Record<string, (context: BoundContext) => string> = {
  'introduction-problem': (context) =>
    `This paper studies ${context.topic.toLowerCase()}, and reports what the evidence registry of this run can support.`,

  'introduction-contribution': (context) =>
    `${context.framing?.statement ?? ''} The analysis quotes only numbers that are reconstructible from that registry.`,

  'introduction-policy': () =>
    'The analysis is restricted to numbers that are reconstructible from the evidence registry, and every reference in this draft resolved through a DOI registry at generation time.',

  'method-quantity': (context) => {
    const solver = context.cfd.solver === 'synthetic' ? SYNTHETIC_METHOD : 'SU2';
    const meshes =
      context.cfd.gci && context.cfd.gci.levels.length > 0
        ? ` on ${context.number('meshCount')} systematically refined meshes`
        : ' on the meshes recorded in this run';
    return `The quantity of interest is the ${context.cfd.quantity}. It was computed${meshes} with ${solver}, and its settings and binary are recorded in this run's evidence.`;
  },

  'method-notes': (context) => context.notes.join(' '),

  'results-value': (context) =>
    context.cfd.gci?.valid
      ? `The extrapolated ${context.cfd.quantity} is ${context.number('value')} \u00b1 ${context.number(
          'uncertainty',
        )}.`
      : `The computed ${context.cfd.quantity} is ${context.number('value')}.`,

  'results-grid': (context) =>
    `The observed order of accuracy is ${context.number('apparentOrder')} on ${context.count(
      'meshCount',
      'mesh',
      'meshes',
    )}, and the fine-grid Grid Convergence Index is ${context.number('gciPercent')} percent.`,

  'results-grid-rejected': (context) =>
    `The grid study was rejected, so the ${context.cfd.quantity} is reported without a convergence interval.`,

  'discussion-literature': (context) =>
    `${context.count(
      'verifiedReferences',
      'reference was',
      'references were',
    )} retrieved and DOI-resolved for this run.`,

  'discussion-gaps': (context) =>
    `${context.count(
      'gaps',
      'topic term was',
      'topic terms were',
    )} not covered by that literature.`,

  'discussion-synthetic': () =>
    'These values come from the synthetic benchmark solver and are not physical measurements: they exercise the pipeline and must not be submitted as evidence.',

  'discussion-disclaimer': (context) => context.disclaimer ?? '',

  'conclusion-value': (context) =>
    context.cfd.gci?.valid
      ? `Within the stated uncertainty, the ${context.cfd.quantity} is ${context.number(
          'value',
        )} \u00b1 ${context.number('uncertainty')}.`
      : `The ${context.cfd.quantity} is reported as ${context.number(
          'value',
        )} without a convergence interval, because the grid study was not valid.`,

  'conclusion-provenance': () =>
    'All inputs, solver settings and checksums are recorded in the evidence registry for this run.',

  disclosure: () =>
    'This draft was assembled by the AeroScribe pipeline, an automated writing system. The human author is responsible for every claim in the submitted manuscript, and no language model was used to generate or alter any numeric result: each value is copied from the evidence registry.',
};

/** Render one paragraph from its intent. Throws when the intent has no text. */
export function renderParagraph(
  paragraph: PlannedParagraph,
  context: RenderPlanContext,
): ManuscriptParagraph {
  const render = INTENTS[paragraph.intent];
  if (!render) {
    throw new Error(
      `no renderer for plan intent "${paragraph.intent}" (${paragraph.id}); a plan without text is not a plan`,
    );
  }
  const text = render(bind(context, paragraph)).trim();
  if (text.length === 0) {
    throw new Error(
      `plan intent "${paragraph.intent}" (${paragraph.id}) rendered an empty paragraph`,
    );
  }
  return { id: paragraph.id, text };
}

/** Render every section of the plan. The manuscript is exactly this output. */
export function renderPlan(
  plan: ManuscriptPlanPayload,
  context: RenderPlanContext,
): ManuscriptSectionText[] {
  return plan.sections.map((section) => {
    const paragraphs = section.paragraphs.map((entry) => renderParagraph(entry, context));
    return {
      heading: section.heading,
      body: paragraphs.map((entry) => entry.text).join('\n\n'),
      paragraphs,
    };
  });
}

/* ───────────────────────── stage 6: the projection ───────────────────────── */

/**
 * What stage 6 found when it compared the text with the plan.
 *
 * `checked` is false only for a manuscript written before G, which carries
 * neither a plan reference nor paragraph ids. That case is reported as
 * "not checked" rather than as a pass: a missing check is not a passed check.
 */
export interface ProjectionReport {
  checked: boolean;
  /** Text and plan disagree about a fact; the verdict becomes `revise`. */
  major: string[];
  /** The text is longer than the plan budgeted; a style finding. */
  minor: string[];
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** A printed number is declared when it is one of the plan's numbers, at its printed precision. */
function isDeclared(printed: string, value: number, values: readonly number[]): boolean {
  const digits = significantDigits(printed);
  return values.some(
    (candidate) =>
      Math.abs(candidate - value) <= 1e-12 ||
      (Math.abs(candidate) > 0 && Number(candidate.toPrecision(digits)) === value),
  );
}

/**
 * Compare a manuscript with the plan it says it was rendered from.
 *
 * Three questions, each answerable from the records alone:
 * 1. is every planned paragraph present, and is every paragraph planned?
 * 2. does every number a paragraph prints appear among the keys its plan
 *    declared for it?
 * 3. did any paragraph run past its word budget by more than 20 %?
 *
 * The first two are `major` — the text and the plan disagree about what exists —
 * and the third is `minor`, because length is a budget rather than a claim.
 */
export function checkProjection(
  manuscript: ManuscriptPayload,
  records: readonly EvidenceRecord[],
): ProjectionReport {
  const major: string[] = [];
  const minor: string[] = [];
  const paragraphs = manuscript.sections.flatMap((section) =>
    (section.paragraphs ?? []).map((paragraph) => ({ ...paragraph, heading: section.heading })),
  );

  if (paragraphs.length === 0 && !manuscript.planRef) {
    return { checked: false, major, minor };
  }

  if (!manuscript.planRef) {
    return {
      checked: true,
      major: [
        'The manuscript carries no planRef, so its text cannot be traced to the plan that produced it.',
      ],
      minor,
    };
  }

  const planRef = manuscript.planRef;
  const record = records.find((entry) => entry.seq === planRef.seq);
  if (!record) {
    return {
      checked: true,
      major: [`planRef names evidence #${planRef.seq}, which this run does not contain.`],
      minor,
    };
  }
  if (record.kind !== 'manuscript-plan') {
    return {
      checked: true,
      major: [
        `planRef names evidence #${planRef.seq}, whose kind is "${record.kind}", not "manuscript-plan".`,
      ],
      minor,
    };
  }
  if (record.payloadHash !== planRef.hash) {
    return {
      checked: true,
      major: [
        `planRef hashes evidence #${planRef.seq} as ${planRef.hash}, but the record hashes to ${record.payloadHash}.`,
      ],
      minor,
    };
  }

  const plan = record.payload as ManuscriptPlanPayload;
  const planned = new Map<string, PlannedParagraph>();
  for (const section of plan.sections) {
    for (const paragraph of section.paragraphs) {
      planned.set(paragraph.id, paragraph);
    }
  }

  const present = new Set(paragraphs.map((paragraph) => paragraph.id));
  for (const [id, entry] of planned) {
    if (!present.has(id)) {
      major.push(`The plan's paragraph ${id} (${entry.intent}) is missing from the manuscript.`);
    }
  }

  for (const paragraph of paragraphs) {
    const entry = planned.get(paragraph.id);
    if (!entry) {
      major.push(
        `The ${paragraph.heading} text contains paragraph ${paragraph.id}, which the plan does not list.`,
      );
      continue;
    }

    const declared = entry.numberKeys.map((key) => ({ key, value: manuscript.numbers[key] }));
    for (const field of declared) {
      if (field.value === undefined) {
        major.push(
          `Paragraph ${paragraph.id} declares the number key "${field.key}", which the manuscript's numbers table does not carry.`,
        );
      }
    }
    const values = declared
      .map((field) => field.value)
      .filter((value): value is number => typeof value === 'number');

    for (const token of extractNumericTokens(paragraph.text)) {
      if (!isDeclared(token.raw, token.value, values)) {
        major.push(
          `Paragraph ${paragraph.id} prints ${token.raw}, which its plan does not declare (numberKeys: ${entry.numberKeys.join(', ') || 'none'}).`,
        );
      }
    }

    const length = words(paragraph.text);
    const budget = Math.ceil(entry.targetWords * 1.2);
    if (length > budget) {
      minor.push(
        `Paragraph ${paragraph.id} is ${length} words against a ${entry.targetWords}-word target (${budget} allowed).`,
      );
    }
  }

  return { checked: true, major, minor };
}
