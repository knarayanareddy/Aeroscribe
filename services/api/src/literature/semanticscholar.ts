import type { Paper, PaperSource } from './types';
import { RequestSpacer, fetchWithRetry, type RetryOptions } from './http';
import { normaliseDoi } from './types';

interface S2Paper {
  paperId?: string;
  title?: string;
  abstract?: string | null;
  year?: number | null;
  authors?: Array<{ name?: string }>;
  externalIds?: { DOI?: string } | null;
  citationCount?: number | null;
  url?: string | null;
}

export function mapS2Paper(paper: S2Paper): Paper | null {
  if (!paper.title) return null;
  const doi = paper.externalIds?.DOI ? normaliseDoi(paper.externalIds.DOI) : null;

  return {
    id: `semantic-scholar:${paper.paperId ?? paper.title.slice(0, 60)}`,
    source: 'semantic-scholar' satisfies PaperSource,
    title: paper.title.replace(/\s+/g, ' ').trim(),
    authors: (paper.authors ?? [])
      .map((author) => author.name ?? '')
      .filter((name) => name.length > 0),
    year: typeof paper.year === 'number' ? paper.year : null,
    doi,
    url: paper.url ?? (doi ? `https://doi.org/${doi}` : null),
    abstract: paper.abstract ?? null,
    citationCount: typeof paper.citationCount === 'number' ? paper.citationCount : null,
  };
}

export interface SemanticScholarOptions extends RetryOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Shared limit is ~1 req/s without a key; a key allows faster calls. */
  minIntervalMs?: number;
}

const DEFAULT_BASE = 'https://api.semanticscholar.org/graph/v1';
const FIELDS = 'paperId,title,abstract,year,authors,externalIds,citationCount,url';

/**
 * Semantic Scholar Graph API client.
 *
 * Works without a key at a shared rate limit (~1 request/second); setting
 * `SEMANTIC_SCHOLAR_API_KEY` raises the limit. The key is read from the
 * environment by the server and is never exposed to a browser.
 */
export class SemanticScholarClient {
  readonly name: PaperSource = 'semantic-scholar';
  readonly requiresNetwork = true;
  private readonly options: SemanticScholarOptions;
  private readonly spacer: RequestSpacer;

  constructor(options: SemanticScholarOptions = {}) {
    this.options = options;
    this.spacer = new RequestSpacer(options.minIntervalMs ?? (options.apiKey ? 200 : 1_100));
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.options.apiKey) headers['x-api-key'] = this.options.apiKey;
    return headers;
  }

  async search(
    query: string,
    limit: number,
    options: { signal?: AbortSignal } = {},
  ): Promise<Paper[]> {
    const params = new URLSearchParams({
      query,
      limit: String(Math.min(Math.max(limit, 1), 100)),
      fields: FIELDS,
    });

    await this.spacer.acquire();
    const response = await fetchWithRetry(
      `${this.options.baseUrl ?? DEFAULT_BASE}/paper/search?${params.toString()}`,
      { headers: this.headers() },
      { ...this.options, signal: options.signal },
    );

    if (!response.ok) {
      throw new Error(`Semantic Scholar search failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { data?: S2Paper[] };
    return (body.data ?? []).map(mapS2Paper).filter((paper): paper is Paper => paper !== null);
  }

  async resolveDoi(doi: string, options: { signal?: AbortSignal } = {}): Promise<Paper | null> {
    const normalised = normaliseDoi(doi);
    const params = new URLSearchParams({ fields: FIELDS });
    await this.spacer.acquire();
    const response = await fetchWithRetry(
      `${this.options.baseUrl ?? DEFAULT_BASE}/paper/DOI:${encodeURIComponent(normalised)}?${params.toString()}`,
      { headers: this.headers() },
      { ...this.options, signal: options.signal },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Semantic Scholar DOI lookup failed with HTTP ${response.status}`);
    }

    return mapS2Paper((await response.json()) as S2Paper);
  }
}
