import type { DoiVerification, Paper, PaperSource, SearchReport } from '@aeroscribe/contract';

// The wire types live in `@aeroscribe/contract` so the dashboard and the server
// cannot disagree about them; re-exported here so server modules keep importing
// from one place. `LiteratureProvider` and the DOI helpers below are
// server-only: no client ever speaks to a provider.
export type { DoiVerification, Paper, PaperSource, SearchReport };

export interface LiteratureProvider {
  readonly name: PaperSource;
  /** Providers that hit the network; used to explain offline behaviour. */
  readonly requiresNetwork: boolean;
  search(query: string, limit: number, options?: { signal?: AbortSignal }): Promise<Paper[]>;
  /** Resolve a DOI to its metadata. Returns `null` when the DOI is unknown. */
  resolveDoi(doi: string, options?: { signal?: AbortSignal }): Promise<Paper | null>;
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
