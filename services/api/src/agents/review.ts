import {
  DEFAULT_JOURNAL_TARGET,
  findJournalTarget,
  type JournalTarget,
} from '@aeroscribe/pipeline';
import { buildPolicy, verifyClaims } from '../claims/verify';
import type { StageHandler, StageOutcome } from './types';
import type { ManuscriptPayload } from './writing';
import type { CfdEvidencePayload } from './evidence';

export interface ReviewCommentRecord {
  id: string;
  section: string;
  severity: 'major' | 'minor';
  comment: string;
}

export interface ReviewPayload {
  stage: 'peer-review-council';
  manuscriptTitle: string;
  verdict: 'pass' | 'revise';
  comments: ReviewCommentRecord[];
  checks: Array<{ id: string; description: string; passed: boolean }>;
  reviewedAt: string;
}

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
  if (manuscript.synthetic) {
    add(
      'Results',
      'major',
      'The results come from the synthetic solver. They exercise the pipeline but must not be submitted as physical evidence.',
    );
  }

  const payload: ReviewPayload = {
    stage: 'peer-review-council',
    manuscriptTitle: manuscript.title,
    verdict: comments.some((comment) => comment.severity === 'major') ? 'revise' : 'pass',
    comments,
    checks,
    reviewedAt: now().toISOString(),
  };

  return {
    kind: 'review-report',
    label: `Review council report: ${manuscript.title}`,
    summary:
      payload.verdict === 'pass'
        ? `Passed all ${checks.length} checks.`
        : `${comments.filter((comment) => comment.severity === 'major').length} major issue(s) found.`,
    payload,
    metrics: {
      verdict: payload.verdict,
      checksPassed: checks.filter((check) => check.passed).length,
      checksTotal: checks.length,
      majorComments: comments.filter((comment) => comment.severity === 'major').length,
    },
  };
};

export interface CompliancePayload {
  stage: 'revision-compliance';
  journal: string;
  journalId: string;
  compliant: boolean;
  wordCount: number;
  abstractWords: number;
  abstractWordLimit: number;
  missingSections: string[];
  issues: Array<{ rule: string; severity: 'major' | 'minor'; detail: string }>;
  checkedAt: string;
}

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
  if (review?.verdict === 'revise') {
    issues.push({
      rule: 'review-verdict',
      severity: 'major',
      detail: 'The review council asked for revisions before submission.',
    });
  }

  const payload: CompliancePayload = {
    stage: 'revision-compliance',
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
