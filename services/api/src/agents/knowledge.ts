import { canonicalJson, sha256 } from '../lib/canonical';
import { referenceBlockers } from '../references/recheck';
import type { StageHandler, StageOutcome } from './types';
import type {
  CompliancePayload,
  DoiRecheckPayload,
  ManuscriptPayload,
  NoveltyPayload,
  ReviewPayload,
  SubmissionPayload,
  WikiPayload,
} from '@aeroscribe/contract';

// The payload shapes are the wire contract; re-exported so the stage catalogue
// and the tests keep importing them from the agent that produces them.
export type { SubmissionPayload, WikiPayload };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Stage 8 — compounding knowledge base and submission package.
 *
 * The wiki article is generated from the manuscript; the package is a manifest
 * of *evidence hashes*, not a PDF. A real submission package needs a LaTeX
 * toolchain and publisher-specific formatting, and pretending otherwise is how
 * a prototype ends up claiming it produced a camera-ready paper.
 */
export const knowledgeAndSubmission: StageHandler = async (context): Promise<StageOutcome> => {
  const { run, registry, now } = context;
  const records = await registry.list({ runId: run.id });
  const manuscript = records.find((record) => record.kind === 'manuscript')?.payload as
    ManuscriptPayload | undefined;
  const review = records.find((record) => record.kind === 'review-report')?.payload as
    ReviewPayload | undefined;
  const compliance = records.find((record) => record.kind === 'compliance-report')?.payload as
    CompliancePayload | undefined;
  const novelty = records.find((record) => record.kind === 'novelty-report')?.payload as
    NoveltyPayload | undefined;
  // The newest re-check if one exists; a run that was never re-checked has none,
  // and the blocker below is conditioned on the manuscript's age rather than on
  // the absence of the record.
  const recheck = records.filter((record) => record.kind === 'doi-recheck').at(-1)?.payload as
    DoiRecheckPayload | undefined;

  if (!manuscript)
    throw new Error('knowledge compilation requires a manuscript record for this run');

  const findings = manuscript.sections.find((section) => section.heading === 'Results');
  const markdown = [
    `## ${manuscript.title}`,
    '',
    manuscript.abstract,
    '',
    '### Findings',
    findings?.body ?? 'No results section was generated.',
    '',
    '### Candidate gaps',
    novelty && novelty.uncoveredTerms.length > 0
      ? novelty.uncoveredTerms.map((term) => `- ${term}`).join('\n')
      : '- None identified from the verified literature.',
    '',
    '### Review status',
    review ? `${review.verdict} — ${review.comments.length} comment(s).` : 'Not reviewed.',
    '',
    '### References',
    ...manuscript.references.map((reference) => `- ${reference.citation}`),
  ].join('\n');

  const wiki: WikiPayload = {
    stage: 'aerowiki-submission',
    schemaVersion: 1,
    title: manuscript.title,
    slug: slugify(manuscript.title),
    markdown,
    relatedRunIds: [run.id],
    generatedAt: now().toISOString(),
  };

  const blockers: string[] = [];
  if (review?.verdict !== 'pass') blockers.push('the review council has not passed the manuscript');
  if (compliance && !compliance.compliant) blockers.push('journal compliance has blocking issues');
  if (manuscript.synthetic) blockers.push('the results come from the synthetic solver');

  // One word for the run card: whether these references were checked now, only
  // when the manuscript was written, or checked and found wanting.
  const referenceMetric =
    recheck === undefined
      ? 'generation-time only'
      : recheck.results.some((result) => result.status === 'broken' || result.status === 'mismatch')
        ? 're-checked: problems'
        : 're-checked';

  const referenceState = referenceBlockers({
    manuscriptGeneratedAt: manuscript.generatedAt,
    now: now(),
    maxAgeDays: context.doiMaxAgeDays,
    recheck: recheck ?? null,
  });
  blockers.push(...referenceState);

  // The artefact *is* the canonical JSON of the payload, so the manifest can
  // state its checksum and its size without pretending a file was rendered.
  const files = records.map((record) => {
    const bytes = Buffer.byteLength(canonicalJson(record.payload), 'utf8');
    return {
      name: `${record.kind}-${record.seq}.json`,
      sha256: sha256(canonicalJson(record.payload)),
      bytes,
    };
  });

  const submission: SubmissionPayload = {
    stage: 'aerowiki-submission',
    schemaVersion: 1,
    journal: manuscript.journal,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    files,
    note: 'Manifest only: no PDF or .docx is compiled by this service, and no file is uploaded to a journal.',
    packagedAt: now().toISOString(),
  };

  return {
    kind: 'submission-package',
    label: `AeroWiki article and submission manifest for "${manuscript.title}"`,
    summary:
      submission.status === 'ready'
        ? 'Manifest ready; all reviews and compliance checks passed.'
        : `Submission blocked: ${blockers.join('; ')}.`,
    // Composite payload: the version covers the envelope, and each part carries
    // its own so a reader can track them independently.
    payload: { schemaVersion: 1, wiki, submission },
    metrics: {
      status: submission.status,
      files: files.length,
      blockers: blockers.length,
      references: referenceMetric,
    },
    blocked:
      submission.status === 'ready'
        ? undefined
        : { reason: `The package is not submittable: ${blockers.join('; ')}.` },
  };
};
