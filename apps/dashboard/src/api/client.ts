import type {
  AdvanceResponse,
  ApiErrorBody,
  AuditResponse,
  AuthConfigResponse,
  MeResponse,
  Capabilities,
  ClaimReport,
  CreateRunRequest,
  DoiVerification,
  EvidenceKind,
  EvidenceResponse,
  HealthResponse,
  RunResponse,
  RunsResponse,
  SearchReport,
  VerifyClaimsRequest,
} from '@aeroscribe/contract';

/**
 * The HTTP client.
 *
 * Design notes that matter:
 *
 * - **`fetch` is injected.** Tests never touch the network, and the browser
 *   build cannot accidentally pick up a Node-only fetch shim.
 * - **Errors keep the server's words.** A `409` that says "Stage 0 is waiting
 *   for GATE-0" is shown to the user verbatim; the client only wraps it with
 *   the status it arrived with. "Request failed" is useless to a researcher
 *   who needs to know which gate is open.
 * - **No retries.** An advance that timed out may or may not have run a stage;
 *   retrying it silently could execute the stage twice. The UI offers an
 *   explicit "try again" instead.
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** True when retrying the same request cannot succeed without a change. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export interface ApiClientOptions {
  /** Base URL, e.g. `''` (same origin) or `http://localhost:8787`. */
  baseUrl?: string;
  /**
   * The bearer token, or a function returning it.
   *
   * A function, not a string, because an OIDC access token expires: the client
   * is built once and every request must ask for the token that is good *now*.
   * In development it is also how the dev-server proxy's key is supplied, and
   * in a bundled build it is always empty — a token in the bundle is a leaked
   * token.
   */
  token?: string | (() => string | null);
  /** Called on a `401`, once, so the app can send the browser to the IdP. */
  onUnauthorized?: (error: ApiClientError) => void;
  fetch?: typeof fetch;
}

export interface ApiClient {
  readonly baseUrl: string;
  health(): Promise<HealthResponse>;
  capabilities(): Promise<Capabilities>;
  /** How to log in, or that this deployment needs no login. Never authenticated. */
  authConfig(): Promise<AuthConfigResponse>;
  /** Who the server thinks the caller is; `principal: null` without accounts. */
  me(): Promise<MeResponse>;
  listRuns(): Promise<RunsResponse>;
  getRun(id: string): Promise<RunResponse>;
  createRun(input: CreateRunRequest): Promise<RunResponse>;
  advance(id: string): Promise<AdvanceResponse>;
  approveGate(id: string, gateId: string, actor?: string): Promise<RunResponse>;
  requestRevision(id: string, gateId: string, actor?: string, note?: string): Promise<RunResponse>;
  evidence(id: string, kind?: EvidenceKind): Promise<EvidenceResponse>;
  verifyRegistry(): Promise<{ valid: boolean; records: number; head: string }>;
  audit(limit?: number): Promise<AuditResponse>;
  searchLiterature(query: string, limit?: number): Promise<SearchReport>;
  verifyDoi(doi: string, expectedTitle?: string): Promise<DoiVerification>;
  verifyClaims(input: VerifyClaimsRequest): Promise<ClaimReport>;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Read an error body defensively: a proxy may return HTML, not our JSON. */
function errorFrom(status: number, body: unknown): ApiClientError {
  const parsed = body as Partial<ApiErrorBody> | null;
  const error = parsed?.error;
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ApiClientError(status, error.code, error.message, error.details);
  }
  return new ApiClientError(status, 'unexpected_response', `The API returned ${status}.`);
}

export function createApiClient({
  baseUrl = '',
  token,
  onUnauthorized,
  fetch: fetchImpl = globalThis.fetch,
}: ApiClientOptions = {}): ApiClient {
  const root = trimTrailingSlash(baseUrl);
  const tokenOf = typeof token === 'function' ? token : () => token ?? null;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    // A token in the bundle is a leaked token; this is only ever set by the
    // Vite dev proxy, never by a production build.
    const bearer = tokenOf();
    if (bearer) headers.set('authorization', `Bearer ${bearer}`);

    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, { ...init, headers });
    } catch (error) {
      // A network failure is not an API error: there is no status, no code and
      // no server message. Say so, with the reason the platform gave.
      throw new ApiClientError(
        0,
        'unreachable',
        error instanceof Error ? error.message : 'The API could not be reached.',
      );
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        if (!response.ok) throw errorFrom(response.status, undefined);
        throw new ApiClientError(
          response.status,
          'invalid_json',
          'The API returned something that is not JSON.',
        );
      }
    }

    if (!response.ok) {
      const failure = errorFrom(response.status, body);
      // `403` is an answer about who you are, and the screen should keep it.
      // `401` is "we do not know who you are" — the login is over, and letting
      // every view fail one by one is a worse experience than one redirect.
      if (response.status === 401) onUnauthorized?.(failure);
      throw failure;
    }

    // `verify-doi` answers 422 *with* a body that is a legitimate result
    // ("this DOI did not resolve"), which is handled above as an error.
    return body as T;
  }

  const get = <T>(path: string) => request<T>(path);
  const post = <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    baseUrl: root,

    health: () => get<HealthResponse>('/health'),
    capabilities: () => get<Capabilities>('/api/v1/capabilities'),
    authConfig: () => get<AuthConfigResponse>('/api/v1/auth/config'),
    me: () => get<MeResponse>('/api/v1/me'),

    listRuns: () => get<RunsResponse>('/api/v1/runs'),
    getRun: (id) => get<RunResponse>(`/api/v1/runs/${encodeURIComponent(id)}`),
    createRun: (input) => post<RunResponse>('/api/v1/runs', input),
    advance: (id) => post<AdvanceResponse>(`/api/v1/runs/${encodeURIComponent(id)}/advance`),
    approveGate: (id, gateId, actor) =>
      post<RunResponse>(
        `/api/v1/runs/${encodeURIComponent(id)}/gates/${encodeURIComponent(gateId)}/approve`,
        { actor },
      ),
    requestRevision: (id, gateId, actor, note) =>
      post<RunResponse>(
        `/api/v1/runs/${encodeURIComponent(id)}/gates/${encodeURIComponent(gateId)}/reject`,
        { actor, note },
      ),

    evidence: (id, kind) =>
      get<EvidenceResponse>(
        `/api/v1/runs/${encodeURIComponent(id)}/evidence${kind ? `?kind=${kind}` : ''}`,
      ),
    verifyRegistry: () =>
      get<{ valid: boolean; records: number; head: string }>('/api/v1/evidence/verify'),
    audit: (limit = 100) => get<AuditResponse>(`/api/v1/audit?limit=${limit}`),

    searchLiterature: (query, limit = 10) =>
      get<SearchReport>(`/api/v1/literature/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    verifyDoi: (doi, expectedTitle) =>
      post<DoiVerification>('/api/v1/literature/verify-doi', { doi, expectedTitle }),
    verifyClaims: (input) => post<ClaimReport>('/api/v1/claims/verify', input),
  };
}
