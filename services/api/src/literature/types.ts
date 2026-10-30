export type PaperSource = 'crossref' | 'arxiv' | 'semantic-scholar' | 'fixture';

export interface Paper {
  /** Stable id, `source:externalId`. */
  id: string;
  source: PaperSource;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citationCount: number | null;
}

export interface LiteratureProvider {
  readonly name: PaperSource;
  /** Providers that hit the network; used to explain offline behaviour. */
  readonly requiresNetwork: boolean;
  search(query: string, limit: number, options?: { signal?: AbortSignal }): Promise<Paper[]>;
  /** Resolve a DOI to its metadata. Returns `null` when the DOI is unknown. */
  resolveDoi(doi: string, options?: { signal?: AbortSignal }): Promise<Paper | null>;
}

export interface DoiVerification {
  doi: string;
  normalised: string;
  verified: boolean;
  reason?: string;
  provider?: PaperSource;
  paper?: Paper;
  checkedAt: string;
}

export interface SearchReport {
  query: string;
  papers: Paper[];
  /** Providers that failed, with the reason. Never silently dropped. */
  errors: Array<{ provider: PaperSource; message: string }>;
  /**
   * True when the result came from the bundled fixture corpus instead of live
   * registries. Clients must show this: offline hits are illustrative only.
   */
  offline: boolean;
  executedAt: string;
}

/** DOIs are `10.<registrant>/<suffix>`; anything else is rejected before a request. */
export const DOI_PATTERN = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;

export function normaliseDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
}

export function isValidDoi(raw: string): boolean {
  return DOI_PATTERN.test(normaliseDoi(raw));
}
