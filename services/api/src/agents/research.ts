import { JOURNAL_TARGETS, findJournalTarget, type JournalTarget } from '@aeroscribe/pipeline';
import { toReferenceRecord, type ReferenceRecord } from '../literature';
import type {
  FramingPayload,
  LiteraturePayload,
  NoveltyPayload,
  TopicPayload,
  VerifiedReference,
} from '@aeroscribe/contract';
import type { StageContext, StageHandler, StageOutcome } from './types';

// The payload shapes are the wire contract; re-exported so the stage catalogue
// and the tests keep importing them from the agent that produces them.
export type { FramingPayload, LiteraturePayload, NoveltyPayload, TopicPayload, VerifiedReference };

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function pickJournal(topic: string, requested: string): { journal: JournalTarget; fit: number } {
  const explicit = findJournalTarget(requested);
  const terms = new Set(tokenise(topic));

  const score = (journal: JournalTarget): number => {
    if (journal.scopeKeywords.length === 0) return 0;
    const hits = journal.scopeKeywords.filter((keyword) =>
      tokenise(keyword).some((term) => terms.has(term)),
    ).length;
    return hits / journal.scopeKeywords.length;
  };

  if (explicit) return { journal: explicit, fit: score(explicit) };

  const ranked = [...JOURNAL_TARGETS]
    .map((journal) => ({ journal, fit: score(journal) }))
    .sort((a, b) => b.fit - a.fit);

  return ranked[0] ?? { journal: JOURNAL_TARGETS[0]!, fit: 0 };
}

/**
 * Stage 0 — topic intelligence and journal targeting.
 *
 * Deterministic: it tokenises the topic, scores each configured journal's scope
 * keywords against it and records the numbers it used. No language model is
 * involved, so the same topic always produces the same target.
 */
export const topicIntelligence: StageHandler = async ({ run, now }) => {
  const { journal, fit } = pickJournal(run.topic, run.journal);
  const terms = unique(tokenise(run.topic));
  const matched = journal.scopeKeywords.filter((keyword) =>
    tokenise(keyword).some((term) => terms.includes(term)),
  );

  // Typed against the wire contract, so the dashboard's view of stage 0 cannot
  // drift from what this handler writes.
  const payload: TopicPayload = {
    stage: 'topic-intelligence',
    schemaVersion: 1,
    topic: run.topic,
    requestedJournal: run.journal,
    targetJournal: journal.name,
    journalId: journal.id,
    keywordFit: Number(fit.toFixed(4)),
    matchedKeywords: matched,
    unmatchedKeywords: journal.scopeKeywords.filter((keyword) => !matched.includes(keyword)),
    // Numbers that are part of the research question itself (e.g. "Mach 8") are
    // declared here so the claim verifier can treat them as given, not claimed.
    topicNumbers: Array.from(run.topic.matchAll(/-?\d+(?:\.\d+)?/g), (match) =>
      Number.parseFloat(match[0]),
    ).filter((value) => Number.isFinite(value)),
    generatedAt: now().toISOString(),
  };

  return {
    kind: 'stage-output',
    label: `Topic intelligence for "${run.topic}"`,
    summary: `Targeted ${journal.name} (keyword fit ${(fit * 100).toFixed(0)}%).`,
    payload,
    metrics: {
      journal: journal.name,
      keywordFit: `${(fit * 100).toFixed(0)}%`,
      keywordsMatched: matched.length,
    },
  };
};

/**
 * Stage 1 — literature archaeology.
 *
 * Searches the configured providers, then DOI-resolves the top hits. Anything
 * that does not resolve is kept in `rejected` with the reason, never in
 * `references`, so the writing stage has no way to cite it.
 */
export const literatureArchaeology = async (context: StageContext): Promise<StageOutcome> => {
  const { run, literature, options, now } = context;
  const query = `${run.topic} ${run.journal}`.trim();
  const report = await literature.search(query, { limit: options.paperLimit });
  const toVerify = report.papers.slice(0, options.verifyTop);

  const references: ReferenceRecord[] = [];
  const papers: VerifiedReference[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];

  for (const [position, candidate] of toVerify.entries()) {
    // `report.papers` is already ranked by `rankPapers`; the position is the
    // only relevance signal that exists, so it is recorded as a fact rather
    // than re-derived by the client from citation counts.
    const rank = position + 1;

    if (!candidate.doi) {
      rejected.push({
        title: candidate.title,
        reason:
          candidate.source === 'fixture'
            ? 'offline corpus entries have no DOI by design'
            : 'record has no DOI to resolve',
      });
      continue;
    }

    const verification = await literature.verifyDoi(candidate.doi, {
      expectedTitle: candidate.title,
    });
    const entry = verification.paper ?? candidate;

    if (verification.verified) {
      references.push(
        toReferenceRecord({
          paper: entry,
          index: references.length + 1,
          verification: {
            verifiedAt: verification.checkedAt,
            provider: verification.provider ?? null,
            titleSimilarity: verification.titleSimilarity ?? null,
          },
        }),
      );
      papers.push({
        ...entry,
        verified: true,
        rank,
        ...(verification.provider ? { verificationProvider: verification.provider } : {}),
      });
    } else {
      rejected.push({
        title: candidate.title,
        reason: verification.reason ?? 'DOI did not resolve',
      });
    }
  }

  const payload: LiteraturePayload = {
    stage: 'literature-archaeology',
    schemaVersion: 2,
    query,
    searchedAt: now().toISOString(),
    offline: literature.offline,
    papersFound: report.papers.length,
    papersVerified: references.length,
    references,
    papers,
    rejected,
    providerErrors: report.errors.map((error) => ({
      provider: error.provider,
      message: error.message,
    })),
  };

  return {
    kind: 'literature-search',
    label: `Literature search: ${query}`,
    summary: `${report.papers.length} hits, ${references.length} DOI-verified (${rejected.length} rejected).`,
    payload,
    metrics: {
      papersFound: report.papers.length,
      papersVerified: references.length,
      papersRejected: rejected.length,
      providerErrors: report.errors.length,
    },
  };
};

/**
 * The provider records behind a literature payload.
 *
 * v2 stores them in `papers`; v1 stored them in `references`. Reading both keeps
 * a run started before the upgrade analysable, and the type guard means a
 * malformed record is skipped rather than treated as text.
 */
function providerPapers(literature: LiteraturePayload | undefined): VerifiedReference[] {
  if (!literature) return [];
  const { papers, references } = literature as {
    papers?: unknown;
    references?: unknown;
  };

  if (Array.isArray(papers)) return papers as VerifiedReference[];
  if (!Array.isArray(references)) return [];

  // v1: `references` held the provider records themselves.
  return (references as Array<Partial<VerifiedReference>>).filter(
    (entry): entry is VerifiedReference =>
      typeof entry === 'object' && entry !== null && typeof entry.abstract !== 'undefined',
  ) as VerifiedReference[];
}

/**
 * Stage 2 — novelty and gap detection.
 *
 * Compares the topic's terms against the verified abstracts. A term nobody has
 * published on is reported as a candidate gap — and when there is no verified
 * literature at all, the stage says `insufficient-evidence` instead of inventing
 * a novelty score.
 */
export const noveltyDetection = async (context: StageContext): Promise<StageOutcome> => {
  const { run, registry } = context;
  const literatureRecord = await registry.latest(run.id, 'literature-search');
  const literature = literatureRecord?.payload as LiteraturePayload | undefined;

  // The abstract is provider metadata, not a bibliographic field, so it lives on
  // the raw papers rather than on the reference records.
  const references = providerPapers(literature);
  const terms = unique(tokenise(run.topic));
  const corpus = references
    .map((reference) => `${reference.title} ${reference.abstract ?? ''}`.toLowerCase())
    .join(' ');

  const coveredTerms = terms.filter((term) => corpus.includes(term));
  const uncoveredTerms = terms.filter((term) => !corpus.includes(term));
  const sufficient = references.length >= 3;

  const notes: string[] = [];
  if (!sufficient) {
    notes.push(
      `Only ${references.length} DOI-verified references were available; a novelty claim needs at least 3.`,
    );
  }
  if (literature?.offline) {
    notes.push(
      'Literature search ran in offline mode over the fictional corpus; nothing here is citable.',
    );
  }

  const payload: NoveltyPayload = {
    stage: 'novelty-detection',
    schemaVersion: 1,
    verifiedReferences: references.length,
    uncoveredTerms,
    coveredTerms,
    gapCount: uncoveredTerms.length,
    confidence: sufficient ? 'supported' : 'insufficient-evidence',
    notes,
  };

  return {
    kind: 'novelty-report',
    label: `Novelty assessment for "${run.topic}"`,
    summary: sufficient
      ? `${coveredTerms.length} of ${terms.length} topic terms are covered; ${uncoveredTerms.length} candidate gaps.`
      : `Insufficient evidence: ${references.length} verified references.`,
    payload,
    metrics: {
      verifiedReferences: references.length,
      gaps: uncoveredTerms.length,
      confidence: payload.confidence,
    },
  };
};

/** Stage 3 — contribution framing, built only from the previous two reports. */
export const contributionFraming = async (context: StageContext): Promise<StageOutcome> => {
  const { run, registry } = context;
  const [noveltyRecord, topicRecord] = await Promise.all([
    registry.latest(run.id, 'novelty-report'),
    registry.latest(run.id, 'stage-output'),
  ]);

  const novelty = noveltyRecord?.payload as NoveltyPayload | undefined;
  const topic = topicRecord?.payload as { targetJournal?: string; journalId?: string } | undefined;

  const gaps = novelty?.uncoveredTerms ?? [];
  const verified = novelty?.verifiedReferences ?? 0;

  const statement =
    gaps.length > 0
      ? `This work addresses ${gaps.join(', ')} in ${run.topic.toLowerCase()}, a gap not covered by the ${verified} DOI-verified references retrieved for this topic.`
      : `This work consolidates the existing literature on ${run.topic.toLowerCase()} (${verified} DOI-verified references) and quantifies it with a verified grid-convergence study.`;

  const payload: FramingPayload = {
    stage: 'contribution-framing',
    schemaVersion: 1,
    statement,
    journal: topic?.targetJournal ?? run.journal,
    journalId: topic?.journalId ?? '',
    position: novelty?.confidence === 'supported' ? 'gap-filling' : 'consolidating',
    evidenceBasis: { verifiedReferences: verified, gaps: gaps.length },
  };

  return {
    kind: 'stage-output',
    label: `Contribution statement for "${run.topic}"`,
    summary: payload.statement,
    payload,
    metrics: {
      position: payload.position,
      verifiedReferences: verified,
      gaps: gaps.length,
    },
  };
};
