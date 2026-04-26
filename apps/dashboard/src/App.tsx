import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import PipelineView from './components/PipelineView';
import LiteratureView from './components/LiteratureView';
import NoveltyView from './components/NoveltyView';
import CFDView from './components/CFDView';
import ManuscriptView from './components/ManuscriptView';
import ReviewView from './components/ReviewView';
import WikiView from './components/WikiView';
import SettingsView from './components/SettingsView';

type View = 'dashboard' | 'pipeline' | 'literature' | 'novelty' | 'cfd' | 'manuscript' | 'review' | 'wiki' | 'settings';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  const handleNavigate = (view: string, runId?: string) => {
    setActiveView(view as View);
    if (runId) setSelectedRunId(runId);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'pipeline':
        return <PipelineView selectedRunId={selectedRunId} />;
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
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <main className="flex-1 overflow-y-auto min-h-screen">
        {renderView()}
      </main>
    </div>
  );
}
