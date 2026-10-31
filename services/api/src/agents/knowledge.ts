import { findJournalTarget } from '@aeroscribe/pipeline';
import { canonicalJson, sha256 } from '../lib/canonical';
import { buildPolicy, verifyClaims } from '../claims/verify';
import { UnverifiableClaimError } from '../errors';
import { referenceBlockers } from '../references/recheck';
import type { StageHandler, StageOutcome } from './types';
import type {
  CfdEvidencePayload,
  CompliancePayload,
  DoiRecheckPayload,
  LiteraturePayload,
  ManuscriptPayload,
  ManuscriptRenderPayload,
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
 * The wiki article is generated from the manuscript, and the submission package
 * is a manifest of *evidence hashes*. The typeset manuscript is a separate
 * record (`manuscript-render`), produced by the same stage: the `.tex` is always
 * written, the PDF only when a TeX engine is configured, and a missing PDF is a
 * blocker rather than a footnote. Claim verification runs on the **rendered
 * text**, so a number that never reached a record cannot reach the PDF either.
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

  // ── The typeset manuscript ────────────────────────────────────────────────
  //
  // Rendering happens here, not in a route: the artefact is part of what stage 8
  // decides, and a package that claims to be submittable while its PDF does not
  // exist would be a lie the registry could not correct.
  const journal = findJournalTarget(manuscript.journalId);
  if (!journal) {
    throw new Error(
      `this run's journal "${manuscript.journalId}" is not a configured submission target`,
    );
  }
  const cfd = (records.find((record) => record.kind === 'cfd-run')?.payload ??
    null) as CfdEvidencePayload | null;
  const literature = records.find((record) => record.kind === 'literature-search')?.payload as
    LiteraturePayload | undefined;

  const render = await context.latex.build({
    runId: run.id,
    manuscript,
    journal,
    cfd,
    // The header of the `.tex` names the records it was built from, so the file
    // carries its own provenance.
    inputHashes: records.map((record) => ({
      kind: record.kind,
      seq: record.seq,
      sha256: record.payloadHash,
    })),
  });

  // The same policy stage 5 used, applied to the text a reader will actually
  // see. Counts are declared as derived for the same reason: "3 meshes" is a
  // count of evidence, not a measurement.
  const claims = verifyClaims(
    render.rendered.verifiableText,
    buildPolicy(records, {
      derived: [
        {
          value: literature?.references.length ?? manuscript.referenceCount,
          source: 'literature.references.length',
        },
        { value: novelty?.gapCount ?? 0, source: 'novelty.gapCount' },
        { value: cfd?.gci?.levels.length ?? 0, source: 'cfd.gci.levels.length' },
      ],
    }),
  );
  if (!claims.ok) {
    throw new UnverifiableClaimError(
      claims.unbacked.map((claim) => `${claim.token} (${claim.reason}) in: ${claim.context}`),
    );
  }

  if (render.blocker) blockers.push(render.blocker);

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

  const renderPayload: ManuscriptRenderPayload = render.payload;
  const submission: SubmissionPayload = {
    stage: 'aerowiki-submission',
    schemaVersion: 1,
    journal: manuscript.journal,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    files,
    note:
      renderPayload.typeset === 'pdf'
        ? "Manifest of evidence hashes. The typeset PDF is recorded in this run's manuscript-render record; nothing is uploaded to a journal."
        : "Manifest of evidence hashes. The LaTeX source is recorded in this run's manuscript-render record, but no PDF was typeset; nothing is uploaded to a journal.",
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
    extra: [
      {
        kind: 'manuscript-render',
        label:
          renderPayload.typeset === 'pdf'
            ? `Typeset manuscript for "${manuscript.title}" (${renderPayload.template})`
            : `LaTeX source for "${manuscript.title}" (${renderPayload.template}); no PDF typeset`,
        payload: renderPayload,
      },
    ],
    metrics: {
      status: submission.status,
      files: files.length,
      blockers: blockers.length,
      references: referenceMetric,
      typeset: renderPayload.typeset,
      figures: renderPayload.files.filter((file) => file.name.endsWith('.tex')).length - 1,
    },
    blocked:
      submission.status === 'ready'
        ? undefined
        : { reason: `The package is not submittable: ${blockers.join('; ')}.` },
  };
};
