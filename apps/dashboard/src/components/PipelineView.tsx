import { useState } from 'react';
import { mockPipelineRuns, PipelineRun, StageInfo, mockAgentLogs, journalProfiles } from '../data/mockData';

interface PipelineViewProps {
  selectedRunId?: string;
}

export default function PipelineView({ selectedRunId }: PipelineViewProps) {
  const [runs, setRuns] = useState<PipelineRun[]>(mockPipelineRuns);
  const [activeRun, setActiveRun] = useState<PipelineRun>(
    mockPipelineRuns.find(r => r.id === selectedRunId) || mockPipelineRuns[0]
  );
  const [showNewRun, setShowNewRun] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newJournal, setNewJournal] = useState('Journal of Propulsion and Power');
  const [expandedStage, setExpandedStage] = useState<number | null>(activeRun.currentStage);

  const approveGate = (run: PipelineRun, stageId: number) => {
    setRuns(prev => prev.map(r => {
      if (r.id !== run.id) return r;
      const newStages = r.stages.map(s => s.id === stageId ? { ...s, gateApproved: true, status: 'completed' as const } : s);
      const nextStage = newStages.find(s => s.id === stageId + 1);
      if (nextStage) nextStage.status = 'running';
      return { ...r, stages: newStages, currentStage: stageId + 1, status: 'running' as const };
    }));
    setActiveRun(prev => {
      const newStages = prev.stages.map(s => s.id === stageId ? { ...s, gateApproved: true, status: 'completed' as const } : s);
      const nextIdx = stageId + 1;
      if (newStages[nextIdx]) newStages[nextIdx] = { ...newStages[nextIdx], status: 'running' };
      return { ...prev, stages: newStages, currentStage: nextIdx, status: 'running' };
    });
  };

  const createRun = () => {
    if (!newTopic.trim()) return;
    const newRun: PipelineRun = {
      id: `run-${Date.now()}`,
      topic: newTopic,
      journal: newJournal,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 0,
      noveltyScore: 0,
      paperTitle: 'Pending...',
      stages: [
        { id: 0, name: 'Topic Intelligence', shortName: 'Topic', status: 'running', agentsActive: ['TopicIntelligenceAgent'], metrics: {} },
        { id: 1, name: 'Literature Archaeology', shortName: 'Literature', status: 'pending', agentsActive: [], metrics: {} },
        { id: 2, name: 'Novelty Detection', shortName: 'Novelty', status: 'pending', agentsActive: [], metrics: {} },
        { id: 3, name: 'Contribution Framing', shortName: 'Framing', status: 'pending', agentsActive: [], metrics: {} },
        { id: 4, name: 'Evidence Generation (CFD)', shortName: 'CFD', status: 'pending', agentsActive: [], metrics: {} },
        { id: 5, name: 'Paper Synthesis', shortName: 'Writing', status: 'pending', agentsActive: [], metrics: {} },
        { id: 6, name: 'Peer Review Council', shortName: 'Review', status: 'pending', agentsActive: [], metrics: {} },
        { id: 7, name: 'Revision & Compliance', shortName: 'Revision', status: 'pending', agentsActive: [], metrics: {} },
        { id: 8, name: 'AeroWiki & Submission', shortName: 'Submit', status: 'pending', agentsActive: [], metrics: {} },
      ]
    };
    setRuns(prev => [newRun, ...prev]);
    setActiveRun(newRun);
    setShowNewRun(false);
    setNewTopic('');
  };

  const stageColors: Record<string, string> = {
    completed: 'bg-emerald-500 border-emerald-500 text-white',
    running: 'bg-blue-500 border-blue-500 text-white',
    gate_pending: 'bg-orange-400 border-orange-400 text-white',
    pending: 'bg-white border-slate-300 text-slate-400',
    failed: 'bg-red-500 border-red-500 text-white',
  };

  const stageLineColors: Record<string, string> = {
    completed: 'bg-emerald-400',
    running: 'bg-blue-400',
    gate_pending: 'bg-orange-400',
    pending: 'bg-slate-200',
    failed: 'bg-red-400',
  };

  const runLogs = mockAgentLogs.filter(l => l.runId === activeRun.id);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline Manager</h1>
          <p className="text-slate-500 mt-1">Monitor autonomous research pipeline execution</p>
        </div>
        <button
          onClick={() => setShowNewRun(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeLinecap="round" />
          </svg>
          New Pipeline Run
        </button>
      </div>

      {/* New Run Form */}
      {showNewRun && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Launch New Pipeline Run</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Research Topic</label>
              <textarea
                value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                placeholder="e.g., Adaptive Wing Morphing for Transonic Drag Reduction using SMA Actuators"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Journal</label>
              <select
                value={newJournal}
                onChange={e => setNewJournal(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {journalProfiles.map(j => (
                  <option key={j.id} value={j.name}>{j.name} (IF: {j.impactFactor})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={createRun} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                Launch Pipeline
              </button>
              <button onClick={() => setShowNewRun(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Runs List */}
        <div className="col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Runs</h3>
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => { setActiveRun(run); setExpandedStage(run.currentStage); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                activeRun.id === run.id
                  ? 'border-blue-300 bg-blue-50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  run.status === 'running' ? 'bg-blue-500 animate-pulse' :
                  run.status === 'gate_pending' ? 'bg-orange-500' :
                  run.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-400'
                }`} />
                <span className="text-xs text-slate-500 capitalize">{run.status.replace('_', ' ')}</span>
                {run.noveltyScore > 0 && (
                  <span className="ml-auto text-xs font-bold text-violet-600">N: {run.noveltyScore}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-800 line-clamp-2">{run.topic}</div>
              <div className="text-xs text-slate-400 mt-1">{run.journal}</div>
              <div className="flex gap-0.5 mt-2">
                {run.stages.map(s => (
                  <div key={s.id} className={`h-1 flex-1 rounded-full ${stageLineColors[s.status]}`} />
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Stage Detail */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 line-clamp-2">{activeRun.topic}</h2>
                <div className="text-sm text-slate-500 mt-1">{activeRun.journal}</div>
              </div>
              {activeRun.noveltyScore > 0 && (
                <div className="shrink-0 ml-4 text-center">
                  <div className="text-2xl font-black text-violet-600">{activeRun.noveltyScore}</div>
                  <div className="text-xs text-slate-500">Novelty Score</div>
                </div>
              )}
            </div>
            {activeRun.paperTitle !== 'Pending...' && (
              <p className="text-xs italic text-slate-500 border-t border-slate-100 pt-2 mt-2">
                📄 "{activeRun.paperTitle}"
              </p>
            )}
          </div>

          {/* Pipeline stages */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Pipeline Stages</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {activeRun.stages.map((stage: StageInfo) => (
                <div key={stage.id}>
                  <button
                    onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    {/* Stage number */}
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${stageColors[stage.status]}`}>
                      {stage.status === 'completed' ? '✓' : stage.status === 'running' ? '◉' : stage.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{stage.name}</span>
                        {stage.status === 'running' && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full animate-pulse">Running</span>
                        )}
                        {stage.status === 'gate_pending' && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full">⏸ Gate: {stage.gateId}</span>
                        )}
                      </div>
                      {stage.agentsActive.length > 0 && (
                        <div className="text-xs text-slate-400 mt-0.5">{stage.agentsActive.join(', ')}</div>
                      )}
                    </div>
                    {stage.duration && (
                      <span className="text-xs text-slate-400 shrink-0">{stage.duration}m</span>
                    )}
                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expandedStage === stage.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {expandedStage === stage.id && (
                    <div className="px-5 pb-4 bg-slate-50 border-t border-slate-100">
                      {Object.keys(stage.metrics || {}).length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mt-3 mb-3">
                          {Object.entries(stage.metrics || {}).map(([k, v]) => (
                            <div key={k} className="bg-white rounded-lg p-3 border border-slate-100">
                              <div className="text-xs text-slate-500">{k.replace(/([A-Z])/g, ' $1').trim()}</div>
                              <div className="text-sm font-bold text-slate-800 mt-0.5">{String(v)}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {stage.status === 'gate_pending' && !stage.gateApproved && (
                        <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">⏸</span>
                            <div className="flex-1">
                              <div className="font-semibold text-orange-800 text-sm">{stage.gateId} — Human-in-the-Loop Gate</div>
                              <div className="text-xs text-orange-600 mt-1 mb-3">
                                Review the {stage.name} results above. Approve to continue the pipeline to Stage {stage.id + 1}.
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => approveGate(activeRun, stage.id)}
                                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                                >
                                  ✓ Approve & Continue
                                </button>
                                <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors">
                                  ✕ Reject & Revise
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {stage.gateApproved && (
                        <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Gate approved by researcher
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Agent Logs */}
          {runLogs.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Agent Activity Log</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {runLogs.map(log => (
                  <div key={log.id} className="flex gap-3 px-5 py-3">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      log.level === 'success' ? 'bg-emerald-400' :
                      log.level === 'warn' ? 'bg-orange-400' :
                      log.level === 'error' ? 'bg-red-400' : 'bg-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-0.5">
                        <span className="font-medium text-slate-600">{log.agentId}</span>
                        <span>·</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {log.costUsd && <span>· ${log.costUsd.toFixed(3)}</span>}
                      </div>
                      <p className="text-xs text-slate-700">{log.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
