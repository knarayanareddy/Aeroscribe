/**
 * Where the client gets its bearer token.
 *
 * One process-wide slot, set by `AuthGate` once the login has resolved, read by
 * the API client on every request. It exists because the client is constructed
 * before the browser knows whether it is logged in — and because a token that
 * expires must stop being sent without rebuilding the client or reloading the
 * page.
 *
 * `none` and `token` deployments never set it: there is nothing for the browser
 * to hold, and the edge injects what the API needs.
 */
export type TokenProvider = () => string | null;

let provider: TokenProvider = () => null;

export function setTokenProvider(next: TokenProvider | null): void {
  provider = next ?? (() => null);
}

export function currentToken(): string | null {
  return provider();
}

/**
 * The session, for the one caller that needs it outside React: the `401`
 * handler, which must forget the token and start a login from inside the client.
 *
 * A module-level slot rather than a ref, because a ref read inside `useMemo` is
 * a render-time read of mutable state — the hook linter is right to refuse it,
 * and this is the smaller change.
 */
let session: () => { clear(): void; start(): Promise<string> } | null = () => null;

export function setCurrentSession(next: { clear(): void; start(): Promise<string> } | null): void {
  session = next === null ? () => null : () => next;
}

export function currentSession(): { clear(): void; start(): Promise<string> } | null {
  return session();
}
