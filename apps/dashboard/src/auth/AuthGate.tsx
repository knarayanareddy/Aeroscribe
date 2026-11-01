import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthConfigResponse } from '@aeroscribe/contract';
import type { ApiClient } from '../api/client';
import { PrincipalProvider } from './PrincipalProvider';
import type { Principal } from './permissions';
import type { AuthSession } from './session';

/**
 * The login, before the app.
 *
 * Three deployments walk through this component and only one of them notices it:
 *
 * - fixture mode never mounts it;
 * - `none` and `token` deployments mount it, ask `/api/v1/auth/config`, read
 *   `mode: "token"`, and render the app unchanged — the browser holds no
 *   credential and the edge supplies one;
 * - `oidc` deployments get sent to the issuer, come back with a code, exchange
 *   it, and only then render the app.
 *
 * It also owns the *end* of a login: a `401` anywhere in the app means the token
 * is no longer honoured (expired, revoked, or from another deployment), and the
 * honest response is one redirect rather than a screen of failures.
 */

export interface AuthGateProps {
  config: AuthConfigResponse | null;
  session: AuthSession | null;
  client: Pick<ApiClient, 'me'>;
  /**
   * The app, once the caller is known. A function here rather than a node,
   * because the pipeline provider must not mount — and start fetching — before
   * there is a token to fetch with.
   */
  children: ReactNode | ((context: { principal: Principal | null }) => ReactNode);
  /** `window.location.replace` in the app; a spy in tests. */
  reload?: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; principal: Principal | null }
  | { kind: 'sign-in'; message: string | null };

export function AuthGate({
  config,
  session,
  client,
  children,
  reload = () => globalThis.location.reload(),
}: AuthGateProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    // React 18 runs effects twice in development; a second login attempt would
    // overwrite the verifier of the first and break the callback.
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    const run = async () => {
      if (config === null || session === null || config.mode !== 'oidc') {
        setState({ kind: 'ready', principal: null });
        return;
      }

      try {
        // A callback is handled before anything else: the address bar still has
        // `?code=`, and rendering the app first would show one screen of
        // unauthenticated failures before the token exists.
        const completed = await session.complete();
        if (cancelled) return;
        if (completed === null) {
          if (session.token() === null) {
            setState({ kind: 'sign-in', message: null });
            await session.start();
            return;
          }
        } else {
          // The code is spent; leaving it in the URL means a refresh replays a
          // callback the IdP will refuse.
          globalThis.history.replaceState({}, '', globalThis.location.pathname);
        }

        const { principal } = await client.me();
        if (cancelled) return;
        if (principal === null) {
          // `oidc` mode with no principal is a contradiction, not a state to
          // render around.
          setState({
            kind: 'error',
            message: 'The server accepted the login but has no account for it.',
          });
          return;
        }
        setState({ kind: 'ready', principal });
      } catch (error) {
        if (cancelled) return;
        setState({
          kind: 'sign-in',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [config, session, client]);

  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <p role="status">Checking how this deployment authenticates…</p>
      </main>
    );
  }

  if (state.kind === 'sign-in') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Sign in to AeroScribe</h1>
          <p className="mt-2 text-sm text-slate-600">
            This deployment uses an identity provider. You should be sent there automatically.
          </p>
          {state.message !== null && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              if (session) void session.start().then(reload);
            }}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p role="alert" className="max-w-md rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </p>
      </main>
    );
  }

  const content =
    typeof children === 'function' ? children({ principal: state.principal }) : children;
  return <PrincipalProvider principal={state.principal}>{content}</PrincipalProvider>;
}
