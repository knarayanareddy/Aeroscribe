import { useState } from 'react';
import CFDView from './components/CFDView';
import DataModeBadge from './components/DataModeBadge';
import FixtureOnlyNotice from './components/FixtureOnlyNotice';
import Dashboard from './components/Dashboard';
import LiteratureView from './components/LiteratureView';
import ManuscriptView from './components/ManuscriptView';
import NoveltyView from './components/NoveltyView';
import PipelineView from './components/PipelineView';
import ReviewView from './components/ReviewView';
import SettingsView from './components/SettingsView';
import Sidebar, { type View } from './components/Sidebar';
import WikiView from './components/WikiView';
import { PipelineProvider } from './state/PipelineProvider';
import { usePipeline } from './state/pipelineContext';
import { createSourceFromEnv } from './state/sourceFromEnv';

export function AppShell() {
  const { selectRun, mode } = usePipeline();
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [navOpen, setNavOpen] = useState(false);

  const navigate = (view: View, runId?: string) => {
    if (runId) selectRun(runId);
    setActiveView(view);
    setNavOpen(false);
  };

  /**
   * Views that still render fixtures are refused in live mode rather than shown
   * with demo numbers under a live badge. Removing a view from this list is the
   * last step of migrating it.
   */
  const fixtureOnly: Partial<Record<View, string>> =
    mode === 'live'
      ? {
          novelty: 'Novelty detection',
          manuscript: 'Manuscript',
          review: 'Peer review',
          wiki: 'AeroWiki',
        }
      : {};

  const renderView = () => {
    const gated = fixtureOnly[activeView];
    if (gated) return <FixtureOnlyNotice view={gated} />;

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
  const source = createSourceFromEnv();

  return (
    <PipelineProvider source={source}>
      <AppShell />
    </PipelineProvider>
  );
}
