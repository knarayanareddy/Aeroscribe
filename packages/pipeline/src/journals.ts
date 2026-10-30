/**
 * Submission targets the compliance stage can check against.
 *
 * These values are configured from each journal's public author guidelines and
 * must be re-checked before an actual submission; they are not scraped at
 * runtime, and a mismatch is a configuration bug, not a solver bug. Every field
 * is used by a concrete check in `services/api/src/agents/review.ts`.
 */
export interface JournalTarget {
  id: string;
  name: string;
  publisher: string;
  latexTemplate: string;
  citationStyle: 'numbered' | 'author-year';
  /** Hard limit on abstract length, in words. */
  abstractWordLimit: number;
  /** Section headings the journal expects, in order. */
  sectionOrder: string[];
  /** Whether the journal requires an explicit AI-use disclosure. */
  requiresAiDisclosure: boolean;
  /** Scope keywords used to score topic fit; kept short and literal. */
  scopeKeywords: string[];
}

export const JOURNAL_TARGETS: readonly JournalTarget[] = [
  {
    id: 'aiaa-journal',
    name: 'AIAA Journal',
    publisher: 'AIAA',
    latexTemplate: 'aiaa-tc (AIAA technical paper)',
    citationStyle: 'numbered',
    abstractWordLimit: 250,
    sectionOrder: ['Introduction', 'Method', 'Results', 'Discussion', 'Conclusion'],
    requiresAiDisclosure: true,
    scopeKeywords: [
      'aerodynamics',
      'fluid mechanics',
      'combustion',
      'propulsion',
      'structures',
      'aeroacoustics',
      'hypersonics',
    ],
  },
  {
    id: 'jpp',
    name: 'Journal of Propulsion and Power',
    publisher: 'AIAA',
    latexTemplate: 'aiaa-tc (AIAA technical paper)',
    citationStyle: 'numbered',
    abstractWordLimit: 250,
    sectionOrder: ['Introduction', 'Method', 'Results', 'Discussion', 'Conclusion'],
    requiresAiDisclosure: true,
    scopeKeywords: [
      'propulsion',
      'combustion',
      'detonation',
      'rocket',
      'turbomachinery',
      'scramjet',
    ],
  },
  {
    id: 'ast',
    name: 'Aerospace Science and Technology',
    publisher: 'Elsevier',
    latexTemplate: 'elsarticle-num',
    citationStyle: 'numbered',
    abstractWordLimit: 300,
    sectionOrder: ['Introduction', 'Method', 'Results', 'Discussion', 'Conclusion'],
    requiresAiDisclosure: true,
    scopeKeywords: [
      'aerospace',
      'aerodynamics',
      'structures',
      'materials',
      'flight mechanics',
      'spacecraft',
    ],
  },
  {
    id: 'acta',
    name: 'Acta Astronautica',
    publisher: 'Elsevier',
    latexTemplate: 'elsarticle-num',
    citationStyle: 'numbered',
    abstractWordLimit: 300,
    sectionOrder: ['Introduction', 'Method', 'Results', 'Discussion', 'Conclusion'],
    requiresAiDisclosure: true,
    scopeKeywords: [
      'astronautics',
      'spacecraft',
      'orbital',
      're-entry',
      'propulsion',
      'space environment',
    ],
  },
] as const;

/** Exact-name lookup first, then a case-insensitive substring match. */
export function findJournalTarget(name: string): JournalTarget | null {
  const needle = name.trim().toLowerCase();
  const exact = JOURNAL_TARGETS.find(
    (journal) => journal.id === needle || journal.name.toLowerCase() === needle,
  );
  if (exact) return exact;

  return (
    JOURNAL_TARGETS.find(
      (journal) => needle.includes(journal.id) || journal.name.toLowerCase().includes(needle),
    ) ?? null
  );
}

/** Default target when a request does not name one. */
export const DEFAULT_JOURNAL_TARGET = JOURNAL_TARGETS[0]!;
