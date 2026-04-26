import { mockPipelineRuns, mockWikiArticles } from '../data/mockData';

interface DashboardProps {
  onNavigate: (view: string, runId?: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const stats = [
    { label: 'Active Pipelines', value: '2', change: '+1 this week', icon: '⚡', color: 'from-blue-500 to-cyan-500' },
    { label: 'Papers Published', value: '1', change: 'Pending 2', icon: '📄', color: 'from-emerald-500 to-teal-500' },
    { label: 'Literature Indexed', value: '468', change: '+147 today', icon: '📚', color: 'from-violet-500 to-purple-600' },
    { label: 'AeroWiki Articles', value: '6', change: '+1 in draft', icon: '🌐', color: 'from-orange-500 to-amber-500' },
  ];

  const statusColors: Record<string, string> = {
    running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    gate_pending: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    idle: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  const statusLabels: Record<string, string> = {
    running: '● Running',
    gate_pending: '⏸ Gate Pending',
    completed: '✓ Completed',
    failed: '✕ Failed',
    idle: '○ Idle',
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Research Dashboard</h1>
          <p className="text-slate-500 mt-1">World's first autonomous aerospace research laboratory</p>
        </div>
        <button
          onClick={() => onNavigate('pipeline')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeLinecap="round" />
          </svg>
          New Pipeline Run
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-lg mb-4`}>
              {s.icon}
            </div>
            <div className="text-3xl font-bold text-slate-900">{s.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{s.label}</div>
            <div className="text-xs text-slate-400 mt-2">{s.change}</div>
          </div>
        ))}
      </div>

      {/* Active Pipelines */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Active Pipeline Runs</h2>
          <button onClick={() => onNavigate('pipeline')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all →</button>
        </div>
        <div className="space-y-3">
          {mockPipelineRuns.map((run) => {
            const completedStages = run.stages.filter(s => s.status === 'completed').length;
            const progress = (completedStages / run.stages.length) * 100;
            return (
              <div
                key={run.id}
                className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:border-blue-200 transition-colors cursor-pointer"
                onClick={() => onNavigate('pipeline', run.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[run.status]}`}>
                        {statusLabels[run.status]}
                      </span>
                      <span className="text-xs text-slate-400">{run.journal}</span>
                    </div>
                    <h3 className="font-semibold text-slate-800 text-sm truncate">{run.topic}</h3>
                    <p className="text-xs text-slate-500 mt-1 truncate italic">"{run.paperTitle}"</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-900">{completedStages}/9</div>
                    <div className="text-xs text-slate-400">stages</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex gap-1">
                    {run.stages.map((stage) => (
                      <div
                        key={stage.id}
                        className={`h-1.5 flex-1 rounded-full ${
                          stage.status === 'completed' ? 'bg-emerald-400' :
                          stage.status === 'running' ? 'bg-blue-400 animate-pulse' :
                          stage.status === 'gate_pending' ? 'bg-orange-400' :
                          stage.status === 'failed' ? 'bg-red-400' : 'bg-slate-200'
                        }`}
                        title={stage.name}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">
                      {run.stages[run.currentStage]?.name || 'Complete'}
                    </span>
                    <span className="text-xs text-slate-400">{Math.round(progress)}%</span>
                  </div>
                </div>
                {run.status === 'gate_pending' && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span><strong>Action Required:</strong> {run.stages[run.currentStage]?.gateId} needs your approval to continue</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Principles */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">🧬 Core Principles</h3>
          <div className="space-y-3">
            {[
              { icon: '🚫', label: 'Zero Hallucination', desc: 'No fabricated numbers. Every value traces to VerifiedRegistry.' },
              { icon: '🔐', label: 'Verified Registry', desc: 'SHA256 checksums on all computational evidence.' },
              { icon: '🎯', label: 'Journal Calibration', desc: 'Automated AIAA, Elsevier, and Acta Astronautica formatting.' },
              { icon: '👤', label: 'Human-in-the-Loop', desc: '11 mandatory researcher decision gates per pipeline.' },
            ].map((p) => (
              <div key={p.label} className="flex gap-3">
                <span className="text-lg">{p.icon}</span>
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.label}</div>
                  <div className="text-xs text-slate-500">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AeroWiki */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">🌐 AeroWiki</h3>
            <button onClick={() => onNavigate('wiki')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</button>
          </div>
          <div className="space-y-2.5">
            {mockWikiArticles.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.status === 'published' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <div className="min-w-0">
                    <div className="text-sm text-slate-700 font-medium truncate">{a.title}</div>
                    <div className="text-xs text-slate-400">{a.category} · {a.papersLinked} papers</div>
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{a.lastUpdated}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
