import type {
  LiteratureProvider,
  Paper,
  PaperSource,
  SearchReport,
  DoiVerification,
} from './types';
import { isValidDoi, normaliseDoi } from './types';
import { searchOfflineCorpus } from './fixtures';

export * from './reference';
export * from './types';
export { CrossrefClient, mapCrossrefItem, stripJats } from './crossref';
export { ArxivClient, parseArxivFeed } from './arxiv';
export { SemanticScholarClient, mapS2Paper } from './semanticscholar';
export { OFFLINE_CORPUS, isFixturePaper, searchOfflineCorpus } from './fixtures';
export { fetchWithRetry, RequestSpacer, backoffDelay, parseRetryAfter } from './http';

/** Token-overlap similarity used to check a DOI's title against an expected one. */
export function titleSimilarity(expected: string, actual: string): number {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2),
    );

  const a = tokens(expected);
  const b = tokens(actual);
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Deduplicate by DOI when present, otherwise by normalised title. When two
 * providers describe the same work, the richer record wins: one with a DOI,
 * then the one with more authors, then the older canonical provider order.
 */
export function dedupePapers(papers: readonly Paper[]): Paper[] {
  const byKey = new Map<string, Paper>();

  for (const paper of papers) {
    const key = paper.doi
      ? `doi:${paper.doi}`
      : `title:${paper.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, paper);
      continue;
    }

    const existingScore =
      (existing.doi ? 10 : 0) + existing.authors.length + (existing.abstract ? 2 : 0);
    const candidateScore = (paper.doi ? 10 : 0) + paper.authors.length + (paper.abstract ? 2 : 0);
    if (candidateScore > existingScore) byKey.set(key, paper);
  }

  return Array.from(byKey.values());
}

/** Ranking used for search results: DOI-bearing records first, then citations. */
export function rankPapers(papers: readonly Paper[]): Paper[] {
  return [...papers].sort((a, b) => {
    const doiDelta = Number(Boolean(b.doi)) - Number(Boolean(a.doi));
    if (doiDelta !== 0) return doiDelta;
    return (b.citationCount ?? 0) - (a.citationCount ?? 0);
  });
}

export interface LiteratureServiceOptions {
  providers: LiteratureProvider[];
  /** Providers are skipped in offline mode; the fixture corpus is used instead. */
  offline?: boolean;
  clock?: () => Date;
  /** Per-provider timeout for one search; a slow provider cannot block the rest. */
  providerTimeoutMs?: number;
}

/**
 * Fan out a literature query across providers.
 *
 * Failures are collected per provider and returned, never swallowed: a run that
 * lost Crossref because of a 503 must be able to show *why* its reading list is
 * thin. Offline mode returns only the fictional corpus, which has no DOIs and
 * therefore can never produce a citable reference.
 */
export class LiteratureService {
  private readonly options: LiteratureServiceOptions;
  private readonly clock: () => Date;

  constructor(options: LiteratureServiceOptions) {
    this.options = options;
    this.clock = options.clock ?? (() => new Date());
  }

  get offline(): boolean {
    return this.options.offline ?? false;
  }

  async search(
    query: string,
    { limit = 10, signal }: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<SearchReport> {
    const trimmed = query.trim();
    const executedAt = this.clock().toISOString();

    if (trimmed.length < 3) {
      return { query: trimmed, papers: [], errors: [], offline: this.offline, executedAt };
    }

    if (this.offline) {
      return {
        query: trimmed,
        papers: searchOfflineCorpus(trimmed, limit),
        errors: [],
        offline: true,
        executedAt,
      };
    }

    const errors: Array<{ provider: PaperSource; message: string }> = [];
    const results = await Promise.all(
      this.options.providers.map(async (provider) => {
        try {
          return await this.withTimeout(provider, trimmed, limit, signal);
        } catch (error) {
          errors.push({ provider: provider.name, message: (error as Error).message });
          return [] as Paper[];
        }
      }),
    );

    const papers = rankPapers(dedupePapers(results.flat())).slice(0, limit);
    return { query: trimmed, papers, errors, offline: false, executedAt };
  }

  /**
   * Resolve a DOI against every provider that can answer, and require that the
   * returned record is plausible: a non-empty title and a sane publication year.
   * A DOI is only "verified" when a registry returned it, never because it looks
   * well-formed.
   */
  async verifyDoi(
    rawDoi: string,
    { signal, expectedTitle }: { signal?: AbortSignal; expectedTitle?: string } = {},
  ): Promise<DoiVerification> {
    const normalised = normaliseDoi(rawDoi);
    const checkedAt = this.clock().toISOString();

    if (!isValidDoi(normalised)) {
      return {
        doi: rawDoi,
        normalised,
        verified: false,
        reason: 'not a syntactically valid DOI',
        checkedAt,
      };
    }

    if (this.offline) {
      return {
        doi: rawDoi,
        normalised,
        verified: false,
        reason: 'offline mode: no registry reachable, DOI cannot be verified',
        checkedAt,
      };
    }

    const failures: string[] = [];

    for (const provider of this.options.providers) {
      try {
        const paper = await provider.resolveDoi(normalised, { signal });
        if (!paper) continue;

        if (paper.title.trim().length === 0) {
          failures.push(`${provider.name}: record has no title`);
          continue;
        }

        const year = paper.year;
        const currentYear = this.clock().getUTCFullYear();
        if (year !== null && (year < 1900 || year > currentYear + 1)) {
          failures.push(`${provider.name}: implausible publication year ${year}`);
          continue;
        }

        const similarity = expectedTitle ? titleSimilarity(expectedTitle, paper.title) : null;
        if (similarity !== null && similarity < 0.6) {
          failures.push(`${provider.name}: title does not match the expected reference`);
          continue;
        }

        return {
          doi: rawDoi,
          normalised,
          verified: true,
          provider: provider.name,
          paper,
          checkedAt,
          titleSimilarity: similarity,
        };
      } catch (error) {
        failures.push(`${provider.name}: ${(error as Error).message}`);
      }
    }

    return {
      doi: rawDoi,
      normalised,
      verified: false,
      reason:
        failures.length > 0 ? failures.join('; ') : 'DOI not found in Crossref or Semantic Scholar',
      checkedAt,
    };
  }

  private async withTimeout(
    provider: LiteratureProvider,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Paper[]> {
    const timeoutMs = this.options.providerTimeoutMs ?? 20_000;
    const controller = new AbortController();
    // Carry a reason so the retry layer can say "provider timed out" instead of
    // "the caller aborted" when this deadline is what stopped the request.
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(`provider timed out after ${timeoutMs}ms`, 'TimeoutError'),
        ),
      timeoutMs,
    );
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      return await provider.search(query, limit, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
