import {
  DEFAULT_JOURNAL_TARGET,
  findJournalTarget,
  type JournalTarget,
} from '@aeroscribe/pipeline';
import { buildPolicy, verifyClaims } from '../claims/verify';
import type { StageHandler, StageOutcome } from './types';
import type { ManuscriptPayload } from './writing';
import type { CfdEvidencePayload } from './evidence';
import { checkProjection } from './plan';

import type { CompliancePayload, ReviewCommentRecord, ReviewPayload } from '@aeroscribe/contract';

// The payload shapes are the wire contract; re-exported so the stage catalogue
// and the tests keep importing them from the agent that produces them.
export type { ReviewCommentRecord, ReviewPayload, CompliancePayload };

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Stage 6 — the review council.
 *
 * Deterministic checks, each with a stated rule. There is no language model
 * here on purpose: a reviewer that can hallucinate a criticism is as dangerous
 * as a writer that can hallucinate a number. The checks are the ones a human
 * reviewer would otherwise have to repeat by hand.
 */
export const peerReview: StageHandler = async (context): Promise<StageOutcome> => {
  const { run, registry, now } = context;
  const records = await registry.list({ runId: run.id });
  const manuscript = records.find((record) => record.kind === 'manuscript')?.payload as
    ManuscriptPayload | undefined;
  const cfd = records.find((record) => record.kind === 'cfd-run')?.payload as
    CfdEvidencePayload | undefined;

  if (!manuscript) {
    throw new Error('peer review requires a manuscript record for this run');
  }

  const journal: JournalTarget = findJournalTarget(manuscript.journal) ?? DEFAULT_JOURNAL_TARGET;
  const text = [
    manuscript.title,
    manuscript.abstract,
    ...manuscript.sections.map((section) => `${section.heading}\n${section.body}`),
    ...manuscript.references.map((reference) => reference.citation),
  ].join('\n\n');

  const claims = verifyClaims(text, buildPolicy(records));
  // RULE-030: the text must be the projection of a plan record that exists.
  const projection = checkProjection(manuscript, records);
  const abstractWords = words(manuscript.abstract);
  const hasDisclosure = manuscript.sections.some((section) =>
    /ai use disclosure/i.test(section.heading),
  );
  const gciValid = cfd?.gci?.valid === true;

  const checks = [
    { id: 'RULE-001', description: 'every number traces to an evidence record', passed: claims.ok },
    {
      id: 'RULE-002',
      description: 'every DOI resolves to a verified record',
      passed: claims.observedDois.every((doi) => claims.allowedDois.includes(doi)),
    },
    {
      id: 'JOURNAL-ABSTRACT',
      description: `abstract within ${journal.abstractWordLimit} words`,
      passed: abstractWords <= journal.abstractWordLimit,
    },
    {
      id: 'REFERENCES',
      description: 'at least three DOI-verified references',
      passed: manuscript.referenceCount >= 3,
    },
    { id: 'RULE-004', description: 'AI use disclosure is present', passed: hasDisclosure },
    {
      id: 'RULE-041',
      description: 'grid convergence study is valid',
      passed: gciValid,
    },
    {
      id: 'RULE-030',
      description: projection.checked
        ? 'manuscript text is a projection of its plan'
        : 'manuscript text is a projection of its plan (pre-plan manuscript: nothing to compare)',
      passed: projection.checked && projection.major.length === 0,
      ...(projection.checked ? {} : { skipped: true }),
    },
  ];

  const comments: ReviewCommentRecord[] = [];
  let counter = 0;
  const add = (section: string, severity: 'major' | 'minor', comment: string) => {
    counter += 1;
    comments.push({ id: `RC-${counter}`, section, severity, comment });
  };

  if (!claims.ok) {
    add(
      'Whole manuscript',
      'major',
      `${claims.unbacked.length} numeric or DOI claim(s) could not be traced: ${claims.unbacked
        .slice(0, 3)
        .map((claim) => claim.token)
        .join(', ')}.`,
    );
  }
  if (abstractWords > journal.abstractWordLimit) {
    add(
      'Abstract',
      'minor',
      `Abstract is ${abstractWords} words; ${journal.name} allows ${journal.abstractWordLimit}.`,
    );
  }
  if (manuscript.referenceCount < 3) {
    add(
      'References',
      'major',
      `Only ${manuscript.referenceCount} DOI-verified reference(s). A submission needs at least 3; run the literature stage against live providers.`,
    );
  }
  if (!hasDisclosure) {
    add('Front matter', 'major', 'The AI use disclosure required by RULE-004 is missing.');
  }
  if (!gciValid) {
    add(
      'Results',
      'major',
      `The grid convergence study is not valid (${cfd?.gci?.reason ?? 'no reason recorded'}), so no uncertainty interval may be quoted.`,
    );
  }
  for (const message of projection.major) {
    add('Whole manuscript', 'major', message);
  }
  for (const message of projection.minor) {
    add('Whole manuscript', 'minor', message);
  }
  if (manuscript.synthetic) {
    add(
      'Results',
      'major',
      'The results come from the synthetic solver. They exercise the pipeline but must not be submitted as physical evidence.',
    );
  }

  const payload: ReviewPayload = {
    stage: 'peer-review-council',
    schemaVersion: 1,
    manuscriptTitle: manuscript.title,
    verdict: comments.some((comment) => comment.severity === 'major') ? 'revise' : 'pass',
    comments,
    checks,
    reviewedAt: now().toISOString(),
  };

  const skipped = checks.filter((check) => check.skipped === true);
  const ran = checks.length - skipped.length;

  return {
    kind: 'review-report',
    label: `Review council report: ${manuscript.title}`,
    summary:
      payload.verdict === 'pass'
        ? `Passed ${ran} of ${checks.length} checks${
            skipped.length > 0
              ? `; ${skipped.map((check) => check.id).join(', ')} had nothing to check`
              : ''
          }.`
        : `${comments.filter((comment) => comment.severity === 'major').length} major issue(s) found.`,
    payload,
    metrics: {
      verdict: payload.verdict,
      checksPassed: checks.filter((check) => check.passed).length,
      checksTotal: ran,
      majorComments: comments.filter((comment) => comment.severity === 'major').length,
    },
  };
};

/** Stage 7 — journal compliance and revision packaging. */
export const complianceCheck: StageHandler = async (context): Promise<StageOutcome> => {
  const { run, registry, now } = context;
  const records = await registry.list({ runId: run.id });
  const manuscript = records.find((record) => record.kind === 'manuscript')?.payload as
    ManuscriptPayload | undefined;
  const review = records.find((record) => record.kind === 'review-report')?.payload as
    ReviewPayload | undefined;

  if (!manuscript) throw new Error('compliance requires a manuscript record for this run');

  const journal = findJournalTarget(manuscript.journal) ?? DEFAULT_JOURNAL_TARGET;
  const headings = manuscript.sections.map((section) => section.heading.toLowerCase());
  const missingSections = journal.sectionOrder.filter(
    (expected) => !headings.includes(expected.toLowerCase()),
  );
  const abstractWords = words(manuscript.abstract);

  const issues: CompliancePayload['issues'] = [];
  if (abstractWords > journal.abstractWordLimit) {
    issues.push({
      rule: 'abstract-length',
      severity: 'major',
      detail: `${abstractWords} words exceeds the ${journal.abstractWordLimit}-word limit.`,
    });
  }
  for (const section of missingSections) {
    issues.push({
      rule: 'section-order',
      severity: 'major',
      detail: `The ${section} section is missing.`,
    });
  }
  if (
    journal.citationStyle === 'numbered' &&
    !manuscript.references.every((reference) => /^\[\d+\]/.test(reference.citation))
  ) {
    issues.push({
      rule: 'citation-style',
      severity: 'minor',
      detail: `${journal.name} uses numbered citations; at least one reference is not numbered.`,
    });
  }
  // RULE-032: a reference the formatter could not set in an AIAA form is a
  // blocking issue; one that only lacks optional fields is a note. Manuscripts
  // written before G carry no citation records, and there is nothing to check.
  const citations = manuscript.citations ?? [];
  const incomplete = citations.filter((citation) => citation.style === 'incomplete');
  if (incomplete.length > 0) {
    issues.push({
      rule: 'citation-format',
      severity: 'major',
      detail: `${incomplete.length} reference(s) cannot be set in an AIAA form because the record does not carry the fields the form requires: ${incomplete
        .slice(0, 3)
        .map((citation) => citation.key)
        .join(', ')}.`,
    });
  } else {
    const thinner = citations.filter((citation) => citation.missing.length > 0);
    if (thinner.length > 0) {
      const fields = [...new Set(thinner.flatMap((citation) => citation.missing))].sort();
      issues.push({
        rule: 'citation-format',
        severity: 'minor',
        detail: `${thinner.length} reference(s) are set in AIAA form without ${fields.join(', ')}: the records do not carry those fields, so they are omitted rather than guessed.`,
      });
    }
  }
  if (review?.verdict === 'revise') {
    issues.push({
      rule: 'review-verdict',
      severity: 'major',
      detail: 'The review council asked for revisions before submission.',
    });
  }

  const payload: CompliancePayload = {
    stage: 'revision-compliance',
    schemaVersion: 1,
    journal: journal.name,
    journalId: journal.id,
    compliant: issues.every((issue) => issue.severity !== 'major'),
    wordCount: manuscript.wordCount,
    abstractWords,
    abstractWordLimit: journal.abstractWordLimit,
    missingSections,
    issues,
    checkedAt: now().toISOString(),
  };

  return {
    kind: 'compliance-report',
    label: `Compliance check against ${journal.name}`,
    summary: payload.compliant
      ? `Compliant with ${journal.name} checks.`
      : `${issues.filter((issue) => issue.severity === 'major').length} blocking issue(s) for ${journal.name}.`,
    payload,
    metrics: {
      compliant: payload.compliant ? 'yes' : 'no',
      wordCount: payload.wordCount,
      issues: issues.length,
    },
  };
};
