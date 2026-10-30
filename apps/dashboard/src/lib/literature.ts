import type { Paper } from '@aeroscribe/pipeline';

export interface LiteratureFilter {
  search: string;
  tags: readonly string[];
  minScore: number;
}

/** Filter papers by free-text search, tag selection (OR) and minimum relevance. */
export function filterPapers(papers: readonly Paper[], filter: LiteratureFilter): Paper[] {
  const needle = filter.search.trim().toLowerCase();

  return papers.filter((paper) => {
    const matchesSearch =
      needle.length === 0 ||
      paper.title.toLowerCase().includes(needle) ||
      paper.authors.toLowerCase().includes(needle) ||
      paper.tags.some((tag) => tag.toLowerCase().includes(needle));

    const matchesTags =
      filter.tags.length === 0 || filter.tags.some((tag) => paper.tags.includes(tag));
    const matchesScore = paper.relevanceScore >= filter.minScore;

    return matchesSearch && matchesTags && matchesScore;
  });
}

export function allTags(papers: readonly Paper[]): string[] {
  return Array.from(new Set(papers.flatMap((paper) => paper.tags))).sort((a, b) =>
    a.localeCompare(b),
  );
}
