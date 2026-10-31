import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApiClient } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('api client', () => {
  it('prefixes the base URL and parses JSON', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ runs: [] }),
    );
    const client = createApiClient({ baseUrl: 'http://api.test/', fetch });

    await expect(client.listRuns()).resolves.toEqual({ runs: [] });
    expect(fetch).toHaveBeenCalledWith('http://api.test/api/v1/runs', expect.anything());
  });

  it('sends JSON bodies and an injected bearer token', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ run: { id: 'run-1' } }, 201),
    );
    const client = createApiClient({ baseUrl: '', token: 'secret-token', fetch });

    await client.createRun({ topic: 'transonic wing drag' });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/v1/runs');
    expect((init as RequestInit).method).toBe('POST');
    expect(new Headers((init as RequestInit).headers).get('authorization')).toBe(
      'Bearer secret-token',
    );
  });

  it('keeps the server’s error code and message', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ error: { code: 'conflict', message: 'Stage 0 is waiting for GATE-0.' } }, 409),
    );
    const client = createApiClient({ baseUrl: '', fetch });

    await expect(client.approveGate('run-1', 'GATE-0')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'Stage 0 is waiting for GATE-0.',
    });
  });

  it('reports an unreachable API as status 0, not as a fake success', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError('Failed to fetch');
    });
    const client = createApiClient({ baseUrl: 'http://api.test', fetch });

    const error = await client.listRuns().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 0, code: 'unreachable', message: 'Failed to fetch' });
  });

  it('does not treat an HTML error page as JSON', async () => {
    const fetch = vi.fn(async () => new Response('<html>502</html>', { status: 502, headers: {} }));
    const client = createApiClient({ baseUrl: '', fetch });

    await expect(client.health()).rejects.toMatchObject({
      status: 502,
      code: 'unexpected_response',
    });
  });

  it('encodes ids and query parameters', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ records: [] }),
    );
    const client = createApiClient({ baseUrl: '', fetch });

    await client.evidence('run/with space', 'cfd-run');
    expect(fetch.mock.calls[0]![0]).toBe('/api/v1/runs/run%2Fwith%20space/evidence?kind=cfd-run');

    await client.searchLiterature('transonic wing', 5);
    expect(fetch.mock.calls[1]![0]).toBe('/api/v1/literature/search?q=transonic%20wing&limit=5');
  });

  it('marks a 4xx as a client error and a 5xx as not', async () => {
    const notFound = new ApiClientError(404, 'not_found', 'No such route.');
    const down = new ApiClientError(503, 'capability_unavailable', 'SU2 is not installed.');
    expect(notFound.isClientError).toBe(true);
    expect(down.isClientError).toBe(false);
  });
});
