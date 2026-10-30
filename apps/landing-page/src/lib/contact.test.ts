import { describe, expect, it, vi } from 'vitest';
import { buildIssueUrl, submitContact } from './contact';

const payload = {
  name: 'Ada Lovelace',
  email: 'ada@example.org',
  org: 'Analytical Engines Ltd',
  message: 'I would like to run the pipeline on a transonic wing case.',
};

describe('buildIssueUrl', () => {
  it('prefills the title, body and label for a GitHub issue', () => {
    const url = buildIssueUrl(payload, 'https://github.com/example/repo/issues/new');

    expect(url.startsWith('https://github.com/example/repo/issues/new?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('title')).toBe('Access request — Ada Lovelace');
    expect(params.get('body')).toContain('ada@example.org');
    expect(params.get('body')).toContain('transonic wing case');
    expect(params.get('labels')).toBe('access-request');
  });
});

describe('submitContact', () => {
  it('does not post anything when no endpoint is configured', async () => {
    const fetchImpl = vi.fn();
    const outcome = await submitContact(payload, {
      issueBaseUrl: 'https://github.com/example/repo/issues/new',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.kind).toBe('issue');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports success only for a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const outcome = await submitContact(payload, {
      endpoint: 'https://example.org/contact',
      issueBaseUrl: 'https://github.com/example/repo/issues/new',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome).toEqual({ kind: 'sent' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.org/contact',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces an error instead of claiming success when the endpoint fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const outcome = await submitContact(payload, {
      endpoint: 'https://example.org/contact',
      issueBaseUrl: 'https://github.com/example/repo/issues/new',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.kind).toBe('error');
    expect(outcome.kind === 'error' ? outcome.message : '').toMatch(/500/);
  });

  it('surfaces network failures as errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const outcome = await submitContact(payload, {
      endpoint: 'https://example.org/contact',
      issueBaseUrl: 'https://github.com/example/repo/issues/new',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.kind).toBe('error');
  });
});
