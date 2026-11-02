import type {
  CfdEvidencePayload,
  CompliancePayload,
  EvidenceKind,
  EvidenceRecord,
  ManuscriptParagraph,
  ManuscriptPayload,
  ManuscriptPlanPayload,
  ManuscriptRenderPayload,
  ReviewPayload,
  SubmissionPackagePayload,
} from '@aeroscribe/contract';
import { PIPELINE_STAGES } from '@aeroscribe/pipeline';
import recordedEvidence from '../../dashboard/src/api/__fixtures__/evidence.json';

/**
 * Everything the video puts on screen, read from one recorded run.
 *
 * A demo video is the easiest place in a project to invent a number: nobody
 * diffs a frame. So this file reads the same capture the dashboard's mapper
 * tests read — `services/api/test/contract.test.ts` produced it from a real
 * pipeline execution — and every scene imports its figures from here. Nothing
 * in `scenes/` may type a numeral of its own; `data.test.ts` checks that.
 *
 * The run this capture recorded is a *failed* run, deliberately left that way:
 * the review council asked for revisions and stage 8 stayed shut. A demo that
 * only shows the happy path would be a story about the code.
 */
const records = (recordedEvidence as { records: EvidenceRecord[] }).records;

function payloadOf<T>(kind: EvidenceKind): T {
  const record = records.find((entry) => entry.kind === kind);
  if (!record) throw new Error(`the recorded run has no ${kind} record`);
  return record.payload as T;
}

function recordOf(kind: EvidenceKind): EvidenceRecord {
  const record = records.find((entry) => entry.kind === kind);
  if (!record) throw new Error(`the recorded run has no ${kind} record`);
  return record;
}

export const cfd = payloadOf<CfdEvidencePayload>('cfd-run');
export const plan = payloadOf<ManuscriptPlanPayload>('manuscript-plan');
export const manuscript = payloadOf<ManuscriptPayload>('manuscript');
export const review = payloadOf<ReviewPayload>('review-report');
export const render = payloadOf<ManuscriptRenderPayload>('manuscript-render');
export const compliance = payloadOf<CompliancePayload>('compliance-report');
export const submissionPackage = payloadOf<SubmissionPackagePayload>('submission-package');

/** The records in the order the registry holds them, for the chain scene. */
export const chain = records.map((record) => ({
  seq: record.seq,
  kind: record.kind,
  key: record.id,
  payloadHash: record.payloadHash,
  hash: record.hash,
}));

/** The plan's record, which the manuscript names in `planRef`. */
export const planRecord = recordOf('manuscript-plan');
export const cfdRecord = recordOf('cfd-run');
export const renderRecord = recordOf('manuscript-render');

/**
 * The stage catalogue, counted rather than typed: the landing page, the
 * dashboard and this video all say "nine stages, eleven checkpoints" because
 * this list says so.
 */
export const stages = PIPELINE_STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  shortName: stage.shortName,
  gateId: stage.gateId,
  gateIds: stage.gateIds,
}));
export const gateCount = stages.reduce((total, stage) => total + stage.gateIds.length, 0);

/** Round to a fixed number of significant digits, exactly as the writer does. */
export function significant(value: number, digits: number): string {
  return String(Number(value.toPrecision(digits)));
}

/** The manuscript's headline result, at the precision the manuscript prints. */
export const result = {
  quantity: cfd.quantity,
  unit: cfd.unit,
  value: significant(manuscript.numbers['value']!, 4),
  uncertainty: significant(manuscript.numbers['uncertainty']!, 3),
  synthetic: cfd.solver === 'synthetic',
};

export function headline(): string {
  return `${result.value} ± ${result.uncertainty}`;
}

/** The mesh study, coarse to fine — the order the figure plots. */
export const mesh = [...(cfd.gci?.levels ?? [])]
  .sort((a, b) => a.cells - b.cells)
  .map((level) => ({ level: level.level, cells: level.cells, value: significant(level.value, 6) }));

const gciRecord = cfd.gci;

/** Format a value the record may not carry; absence stays absent. */
function optional<T>(value: T | null | undefined, format: (value: T) => string): string | null {
  return value === null || value === undefined ? null : format(value);
}

/** The GCI points Roache's procedure produces: one per grid pair. */
export const gci = {
  apparentOrder: optional(gciRecord?.apparentOrder, (value) => significant(value, 3)),
  finePercent: optional(gciRecord?.fineGciPercent, (value) => significant(value, 3)),
  mediumPercent: optional(gciRecord?.mediumGciPercent, (value) => significant(value, 3)),
  valid: gciRecord?.valid === true,
  levels: mesh.length,
};

/**
 * The rows `figure-gci.dat` carries, rebuilt here for the scene that shows the
 * file.
 *
 * Roache's procedure produces one GCI per grid *pair*, and the renderer places
 * each at the cell count of the finer grid of its pair. The coarsest level is
 * the finer grid of nothing, so its cell is `nan` — which is what the file says
 * too, rather than a zero that would read as a measured value.
 */
export const figureRows = mesh.map((level, index) => {
  const percent =
    index === mesh.length - 1
      ? gci.finePercent
      : index === mesh.length - 2
        ? gci.mediumPercent
        : null;
  return { cells: level.cells, value: level.value, gciPercent: percent ?? 'nan' };
});

/** Where a paragraph id lives in the plan, and what the text made of it. */
export interface PlannedParagraphView {
  id: string;
  intent: string;
  numberKeys: string[];
  targetWords: number;
  text: string;
}

function printedText(id: string): string {
  for (const section of manuscript.sections) {
    const paragraph = (section.paragraphs ?? []).find(
      (entry: ManuscriptParagraph) => entry.id === id,
    );
    if (paragraph) return paragraph.text;
  }
  return '';
}

const plannedParagraphs = plan.sections
  .flatMap((section) => section.paragraphs.map((paragraph) => ({ section, paragraph })))
  .map(({ paragraph }) => ({
    id: paragraph.id,
    intent: paragraph.intent,
    numberKeys: paragraph.numberKeys,
    targetWords: paragraph.targetWords,
    text: printedText(paragraph.id),
  }));

export const paragraphs = plannedParagraphs;

/** The paragraph the projection scene shows: a real number and its declaration. */
export const resultsParagraph =
  paragraphs.find((paragraph) => paragraph.id === 'p-results-1') ?? paragraphs[0]!;

/** The one the council rejected, so the review scene can quote it. */
export const undeclaredParagraph =
  paragraphs.find((paragraph) => paragraph.id === 'p-introduction-2') ?? paragraphs[1]!;

/** The first reference as a structured record, which is what a citation is set from. */
export const firstReference = (() => {
  const reference = manuscript.references[0];
  if (!reference) throw new Error('the recorded manuscript has no references');
  return {
    key: reference.record.key,
    title: reference.record.title,
    authors: reference.record.authors,
    venue: reference.record.venue,
    year: reference.record.year,
    volume: reference.record.volume,
    issue: reference.record.issue,
    pages: reference.record.pages,
    doi: reference.record.doi,
  };
})();

/** AIAA-formatted references, as the manuscript prints them. */
export const references = manuscript.references.map((reference) => ({
  index: reference.index,
  line: reference.citation,
  doi: reference.doi,
  key: reference.record.key,
  style: manuscript.citations?.find((citation) => citation.key === reference.record.key)?.style,
  missing:
    manuscript.citations?.find((citation) => citation.key === reference.record.key)?.missing ?? [],
}));

/** The council's verdict and the checks behind it. */
export const council = {
  verdict: review.verdict,
  checks: review.checks.map((check) => ({
    id: check.id,
    passed: check.passed,
    skipped: check.skipped === true,
  })),
  failed: review.checks.filter((check) => !check.passed).length,
  major: review.comments.filter((comment) => comment.severity === 'major').length,
  blockedBy: review.comments.find((comment) => comment.severity === 'major')?.comment ?? '',
};

/** The projection finding stage 6 wrote about the paragraph it rejected. */
export const projectionFinding =
  review.comments.find((comment) =>
    /p-introduction-2|projection|plan does not declare/.test(comment.comment),
  )?.comment ?? '';

/** What the render produced: source, or a PDF when a toolchain exists. */
export const typesetting = {
  typeset: render.typeset,
  template: render.template,
  files: render.files.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
  figure: render.files.find((file) => file.name === 'figure-gci.dat') ?? null,
  pdf: render.pdf,
};

/** The run's own facts, so the video never names a different paper. */
export const run = {
  journal: manuscript.journal,
  title: manuscript.title,
  topic: manuscript.title.split(':')[0]!,
  wordCount: manuscript.wordCount,
  referenceCount: manuscript.referenceCount,
  synthetic: manuscript.synthetic,
  planSeq: manuscript.planRef?.seq ?? null,
  planHash: manuscript.planRef?.hash ?? '',
};

/** Short form of a digest for a screen: enough to recognise, never the whole. */
export function shortHash(hash: string, head = 12): string {
  return hash.slice(0, head);
}

/**
 * Stage 8's own verdict, in its own words.
 *
 * The video does not assert that the submission was blocked: it prints the
 * status and the blocker list the `submission-package` record carries, so a run
 * that ships would make the video say so without an edit.
 */
export const submission = {
  status: submissionPackage.submission.status,
  blockers: submissionPackage.submission.blockers,
  files: submissionPackage.submission.files.length,
  journal: submissionPackage.submission.journal,
  compliant: compliance.compliant,
  issues: compliance.issues.map((issue) => ({ rule: issue.rule, severity: issue.severity })),
};
