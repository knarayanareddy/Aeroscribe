export interface ContactPayload {
  name: string;
  email: string;
  org: string;
  message: string;
}

export type ContactOutcome =
  { kind: 'sent' } | { kind: 'issue'; url: string } | { kind: 'error'; message: string };

/** Compose a prefilled GitHub issue URL from the form contents. */
export function buildIssueUrl(payload: ContactPayload, issueBaseUrl: string): string {
  const body = [
    `**Name:** ${payload.name}`,
    `**Email:** ${payload.email}`,
    `**Organization:** ${payload.org || '—'}`,
    '',
    payload.message,
  ].join('\n');

  const params = new URLSearchParams({
    title: `Access request — ${payload.name}`,
    body,
    labels: 'access-request',
  });

  return `${issueBaseUrl}?${params.toString()}`;
}

export interface SubmitContactOptions {
  /** Optional HTTP endpoint that accepts the payload as JSON. */
  endpoint?: string;
  /** Fallback: base URL for creating a GitHub issue. */
  issueBaseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Deliver a contact request.
 *
 * With `VITE_CONTACT_ENDPOINT` configured the payload is POSTed as JSON.
 * Without an endpoint the form never pretends to have sent anything: it returns
 * a prefilled GitHub issue URL so the visitor can deliver the message themselves.
 */
export async function submitContact(
  payload: ContactPayload,
  { endpoint, issueBaseUrl, fetchImpl = fetch }: SubmitContactOptions,
): Promise<ContactOutcome> {
  if (!endpoint) {
    return { kind: 'issue', url: buildIssueUrl(payload, issueBaseUrl) };
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        kind: 'error',
        message: `The contact endpoint responded with ${response.status}. Please try again, or open an issue on GitHub.`,
      };
    }

    return { kind: 'sent' };
  } catch {
    return {
      kind: 'error',
      message: 'The request could not be sent. Please try again, or open an issue on GitHub.',
    };
  }
}
