import { useEffect, useMemo, useState } from 'react';
import type { AuthConfigResponse } from '@aeroscribe/contract';
import CFDView from './components/CFDView';
import DataModeBadge from './components/DataModeBadge';
import Dashboard from './components/Dashboard';
import LiteratureView from './components/LiteratureView';
import ManuscriptView from './components/ManuscriptView';
import NoveltyView from './components/NoveltyView';
import PipelineView from './components/PipelineView';
import ReviewView from './components/ReviewView';
import SettingsView from './components/SettingsView';
import Sidebar, { type View } from './components/Sidebar';
import WikiView from './components/WikiView';
import { createApiClient } from './api/client';
import { AuthGate } from './auth/AuthGate';
import { createAuthSession, type AuthSession } from './auth/session';
import { currentSession, currentToken, setCurrentSession, setTokenProvider } from './auth/token';
import { createApiSource } from './state/apiSource';
import { PipelineProvider } from './state/PipelineProvider';
import { usePipeline } from './state/pipelineContext';
import { createSourceFromEnv, isLiveBuild } from './state/sourceFromEnv';

export function AppShell() {
  const { selectRun } = usePipeline();
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [navOpen, setNavOpen] = useState(false);

  const navigate = (view: View, runId?: string) => {
    if (runId) selectRun(runId);
    setActiveView(view);
    setNavOpen(false);
  };

  // Every view has a live implementation, so none renders fixture data in live
  // mode. `FixtureOnlyNotice` stays for the next view that needs it.
  const renderView = () => {
    switch (activeView) {
      case 'pipeline':
        return <PipelineView onNavigate={navigate} />;
      case 'literature':
        return <LiteratureView />;
      case 'novelty':
        return <NoveltyView />;
      case 'cfd':
        return <CFDView />;
      case 'manuscript':
        return <ManuscriptView />;
      case 'review':
        return <ReviewView />;
      case 'wiki':
        return <WikiView />;
      case 'settings':
        return <SettingsView />;
      case 'dashboard':
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar
        activeView={activeView}
        onNavigate={navigate}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <span className="font-semibold text-slate-800">AeroScribe</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Prototype
          </span>
        </header>

        <DataModeBadge />

        <main id="main" className="min-w-0 flex-1">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  // The source is chosen once, from the build environment. There is no runtime
  // switch that could turn demo data into something that looks live.
  if (isLiveBuild()) return <LiveApp />;

  const source = createSourceFromEnv();
  return (
    <PipelineProvider source={source}>
      <AppShell />
    </PipelineProvider>
  );
}

/**
 * The live app: one client, one session, and the login gate in front.
 *
 * The single client is built before the login exists, because the question this
 * deployment has to answer first — *how do I log in?* — is asked of the API
 * itself. It reads its token through `currentToken`, so the moment the session
 * has one every request carries it, and the moment it expires they stop
 * carrying it.
 */
function LiveApp() {
  const baseUrl = import.meta.env['VITE_API_URL'] ?? '';
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl,
        token: currentToken,
        onUnauthorized: () => {
          // The login is over: forget the token and go back to the IdP. One
          // redirect, not one failed request per view.
          const current = currentSession();
          current?.clear();
          void current?.start().catch(() => undefined);
        },
      }),
    [baseUrl],
  );

  useEffect(() => {
    let cancelled = false;
    void client
      .authConfig()
      .then((answer) => {
        if (cancelled) return;
        const next = createAuthSession({ config: answer });
        setCurrentSession(next);
        setTokenProvider(() => next.token());
        setSession(next);
        setConfig(answer);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const source = useMemo(() => createApiSource({ client }), [client]);

  if (failure !== null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p role="alert" className="max-w-md rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {failure}
        </p>
      </main>
    );
  }

  return (
    <AuthGate config={config} session={session} client={client}>
      {() => (
        <PipelineProvider source={source}>
          <AppShell />
        </PipelineProvider>
      )}
    </AuthGate>
  );
}
