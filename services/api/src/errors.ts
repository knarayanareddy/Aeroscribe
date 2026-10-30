/** Errors that carry the HTTP status the API should answer with. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, 'invalid_request', message, details);
}

export function notFound(message: string): ApiError {
  return new ApiError(404, 'not_found', message);
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, 'conflict', message, details);
}

export function unauthorized(message = 'A valid API key is required.'): ApiError {
  return new ApiError(401, 'unauthorized', message);
}

/** The stage cannot run because a required capability is not configured. */
export class CapabilityUnavailableError extends ApiError {
  constructor(capability: string, message: string, details?: unknown) {
    super(503, 'capability_unavailable', `${capability}: ${message}`, details);
    this.name = 'CapabilityUnavailableError';
  }
}

/** External service failed after the retry budget was exhausted (RULE-042). */
export class UpstreamError extends ApiError {
  constructor(service: string, message: string, details?: unknown) {
    super(502, 'upstream_error', `${service}: ${message}`, details);
    this.name = 'UpstreamError';
  }
}

/** A generated manuscript contained a number that no registry record backs. */
export class UnverifiableClaimError extends ApiError {
  constructor(claims: readonly string[]) {
    super(
      422,
      'unverifiable_claim',
      'The generated text contains numbers with no evidence record.',
      {
        claims,
      },
    );
    this.name = 'UnverifiableClaimError';
  }
}
