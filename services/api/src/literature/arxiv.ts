import type { Paper, PaperSource } from './types';
import { RequestSpacer, fetchWithRetry, type RetryOptions } from './http';
import { normaliseDoi } from './types';

const DEFAULT_BASE = 'https://export.arxiv.org/api/query';

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match?.[1] ? decodeXml(match[1]) : null;
}

/** arXiv abs URLs carry a version suffix (`v1`, `v2`); strip it for a stable id. */
export function stripArxivVersion(url: string): string {
  return url.replace(/v\d+$/i, '');
}

/**
 * Parse an arXiv Atom feed.
 *
 * Exported because it is easier to test against a recorded feed than to mock
 * `fetch`, and because the parser is the part most likely to break when arXiv
 * changes its XML.
 */
export function parseArxivFeed(xml: string): Paper[] {
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));

  return entries
    .map((match): Paper | null => {
      const entry = match[1] ?? '';
      const id = firstTag(entry, 'id');
      const title = firstTag(entry, 'title');
      if (!id || !title) return null;

      const canonical = stripArxivVersion(id);
      const doiTag = firstTag(entry, 'arxiv:doi');
      const published = firstTag(entry, 'published');
      const year = published ? Number.parseInt(published.slice(0, 4), 10) : null;
      const authorBlocks = Array.from(entry.matchAll(/<author>([\s\S]*?)<\/author>/gi));

      return {
        id: `arxiv:${canonical.split('/abs/').at(-1) ?? canonical}`,
        source: 'arxiv' satisfies PaperSource,
        title,
        authors: authorBlocks
          .map((author) => firstTag(author[1] ?? '', 'name'))
          .filter((name): name is string => Boolean(name)),
        year: Number.isFinite(year) ? year : null,
        doi: doiTag ? normaliseDoi(doiTag) : null,
        url: canonical,
        abstract: firstTag(entry, 'summary'),
        citationCount: null,
      };
    })
    .filter((paper): paper is Paper => paper !== null);
}

export interface ArxivOptions extends RetryOptions {
  baseUrl?: string;
  userAgent?: string;
  /** arXiv asks for at most one request every three seconds. */
  minIntervalMs?: number;
}

/**
 * arXiv API client (Atom XML, no key required).
 *
 * arXiv asks for at most one request every three seconds; callers pass one
 * request at a time (`RateLimiter`) and a descriptive User-Agent.
 */
export class ArxivClient {
  readonly name: PaperSource = 'arxiv';
  readonly requiresNetwork = true;
  private readonly options: ArxivOptions;
  private readonly spacer: RequestSpacer;

  constructor(options: ArxivOptions = {}) {
    this.options = options;
    this.spacer = new RequestSpacer(options.minIntervalMs ?? 3_000);
  }

  async search(
    query: string,
    limit: number,
    options: { signal?: AbortSignal } = {},
  ): Promise<Paper[]> {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: '0',
      max_results: String(Math.min(Math.max(limit, 1), 100)),
    });

    await this.spacer.acquire();
    const response = await fetchWithRetry(
      `${this.options.baseUrl ?? DEFAULT_BASE}?${params.toString()}`,
      {
        headers: {
          accept: 'application/atom+xml',
          'user-agent':
            this.options.userAgent ??
            'AeroScribe/0.1 (+https://github.com/knarayanareddy/Aeroscribe)',
        },
      },
      { ...this.options, signal: options.signal },
    );

    if (!response.ok) {
      throw new Error(`arXiv search failed with HTTP ${response.status}`);
    }

    return parseArxivFeed(await response.text());
  }

  /**
   * arXiv does not resolve arbitrary DOIs, so DOI verification is delegated to
   * Crossref and this method returns `null` for everything.
   */
  async resolveDoi(): Promise<Paper | null> {
    return null;
  }
}
