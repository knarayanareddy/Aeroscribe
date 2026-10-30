import type { Paper, PaperSource } from './types';
import { RequestSpacer, fetchWithRetry, type RetryOptions } from './http';
import { normaliseDoi } from './types';

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

export interface CrossrefItem {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { 'date-parts'?: Array<Array<number | null>> };
  published?: { 'date-parts'?: Array<Array<number | null>> };
  abstract?: string;
  'is-referenced-by-count'?: number;
  URL?: string;
  type?: string;
}

/** Crossref abstracts arrive as JATS XML fragments; flatten them to text. */
export function stripJats(input: string | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<jats:title>.*?<\/jats:title>/gis, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

function firstYear(item: CrossrefItem): number | null {
  const parts = item.issued?.['date-parts']?.[0] ?? item.published?.['date-parts']?.[0];
  const year = parts?.[0];
  return typeof year === 'number' && Number.isFinite(year) ? year : null;
}

export function authorName(author: CrossrefAuthor): string {
  if (author.name) return author.name;
  const parts = [author.given, author.family].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.join(' ') || 'Unknown';
}

export function mapCrossrefItem(item: CrossrefItem): Paper | null {
  const doi = item.DOI ? normaliseDoi(item.DOI) : null;
  const title = item.title?.[0]?.replace(/\s+/g, ' ').trim();
  if (!doi && !title) return null;

  return {
    id: `crossref:${doi ?? (title ?? '').slice(0, 60)}`,
    source: 'crossref' satisfies PaperSource,
    title: title ?? 'Untitled',
    authors: (item.author ?? []).map(authorName).filter((name) => name !== 'Unknown'),
    year: firstYear(item),
    doi,
    url: item.URL ?? (doi ? `https://doi.org/${doi}` : null),
    abstract: stripJats(item.abstract),
    citationCount:
      typeof item['is-referenced-by-count'] === 'number' ? item['is-referenced-by-count'] : null,
  };
}

export interface CrossrefOptions extends RetryOptions {
  /** Sent as `mailto` so requests land in the polite pool. */
  contactEmail?: string;
  baseUrl?: string;
  userAgent?: string;
  /** Minimum spacing between requests; Crossref's polite pool asks for ~1/s. */
  minIntervalMs?: number;
}

const DEFAULT_BASE = 'https://api.crossref.org';

/**
 * Crossref REST client.
 *
 * Metadata-only: no credentials are required, and Crossref asks for a contact
 * address (`mailto`) so heavy use is attributable. Rate limit politely: one
 * request per second by default, kept in the caller's `RateLimiter`.
 */
export class CrossrefClient {
  readonly name: PaperSource = 'crossref';
  readonly requiresNetwork = true;
  private readonly options: CrossrefOptions;
  private readonly spacer: RequestSpacer;

  constructor(options: CrossrefOptions = {}) {
    this.options = options;
    this.spacer = new RequestSpacer(options.minIntervalMs ?? 1_000);
  }

  private get baseUrl(): string {
    return this.options.baseUrl ?? DEFAULT_BASE;
  }

  private get userAgent(): string {
    const contact = this.options.contactEmail ? ` (mailto:${this.options.contactEmail})` : '';
    return (
      this.options.userAgent ??
      `AeroScribe/0.1 (+https://github.com/knarayanareddy/Aeroscribe)${contact}`
    );
  }

  async search(
    query: string,
    limit: number,
    options: { signal?: AbortSignal } = {},
  ): Promise<Paper[]> {
    const params = new URLSearchParams({
      query,
      rows: String(Math.min(Math.max(limit, 1), 100)),
      select: 'DOI,title,author,issued,abstract,is-referenced-by-count,URL,type',
    });
    if (this.options.contactEmail) params.set('mailto', this.options.contactEmail);

    await this.spacer.acquire();
    const response = await fetchWithRetry(
      `${this.baseUrl}/works?${params.toString()}`,
      { headers: { accept: 'application/json', 'user-agent': this.userAgent } },
      { ...this.options, signal: options.signal },
    );

    if (!response.ok) {
      throw new Error(`Crossref search failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { message?: { items?: CrossrefItem[] } };
    return (body.message?.items ?? [])
      .map(mapCrossrefItem)
      .filter((paper): paper is Paper => paper !== null);
  }

  async resolveDoi(doi: string, options: { signal?: AbortSignal } = {}): Promise<Paper | null> {
    const normalised = normaliseDoi(doi);
    await this.spacer.acquire();
    const response = await fetchWithRetry(
      `${this.baseUrl}/works/${encodeURIComponent(normalised)}`,
      { headers: { accept: 'application/json', 'user-agent': this.userAgent } },
      { ...this.options, signal: options.signal },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Crossref DOI lookup failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { message?: CrossrefItem };
    return body.message ? mapCrossrefItem(body.message) : null;
  }
}
