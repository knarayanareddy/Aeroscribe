import { useState } from 'react';
import { journalProfiles } from '../data/mockData';

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'api' | 'journals' | 'agents' | 'integrity'>('api');
  const [model, setModel] = useState('claude-opus-4-5');
  const [fastModel, setFastModel] = useState('claude-haiku-3-5');
  const [semanticKey, setSemanticKey] = useState('••••••••••••••••••••');
  const [maxContextStage1, setMaxContextStage1] = useState(15);
  const [maxContextStage4, setMaxContextStage4] = useState(8);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Configure the AeroScribe autonomous research engine</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { id: 'api', label: 'API & Models' },
          { id: 'journals', label: 'Journal Profiles' },
          { id: 'agents', label: 'Agent Config' },
          { id: 'integrity', label: 'Integrity Rules' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'api' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">🤖 AI Models</h3>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Primary Model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="claude-opus-4-5">claude-opus-4-5 (Most capable)</option>
                  <option value="claude-sonnet-4-5">claude-sonnet-4-5 (Balanced)</option>
                  <option value="claude-haiku-3-5">claude-haiku-3-5 (Fast)</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Used for Stage 5 (Writing) and Stage 6 (Review)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Fast Model (Reranking, Classification)</label>
                <select
                  value={fastModel}
                  onChange={e => setFastModel(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="claude-haiku-3-5">claude-haiku-3-5</option>
                  <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Used for literature reranking and contradiction detection</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">🔑 API Keys</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              ⚠️ <strong>RULE-040:</strong> API keys are stored as environment variables only. Never hardcoded in source files. The PreToolUse hook actively blocks any write containing key patterns.
            </div>
            {[
              { label: 'Anthropic API Key', env: 'ANTHROPIC_API_KEY', value: '••••••••••••••••••••', masked: true },
              { label: 'Semantic Scholar API Key', env: 'SEMANTIC_SCHOLAR_API_KEY', value: semanticKey, masked: false, setter: setSemanticKey },
              { label: 'Clerk Secret Key', env: 'CLERK_SECRET_KEY', value: '••••••••••••••••••••', masked: true },
            ].map(k => (
              <div key={k.env}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{k.label}</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={k.value}
                    onChange={k.setter ? e => k.setter!(e.target.value) : undefined}
                    readOnly={k.masked}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Set via ${k.env}`}
                  />
                  <button className="px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">Update</button>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{k.env}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">💾 Infrastructure</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Database', value: 'PostgreSQL 16 (primary state)', status: 'connected' },
                { label: 'Cache / Queue', value: 'Redis 7 + BullMQ', status: 'connected' },
                { label: 'Object Storage', value: 'MinIO (S3-compatible)', status: 'connected' },
                { label: 'CFD Solver', value: 'OpenFOAM 10 (HPC cluster)', status: 'idle' },
              ].map(i => (
                <div key={i.label} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-600">{i.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${i.status === 'connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {i.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700">{i.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'journals' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Journal Profile Database</h3>
            <p className="text-xs text-slate-500 mt-0.5">Scope keywords, formatting requirements, acceptance rates</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Journal</th>
                <th className="text-left px-4 py-3 font-medium">Publisher</th>
                <th className="text-right px-4 py-3 font-medium">Impact Factor</th>
                <th className="text-right px-4 py-3 font-medium">Accept Rate</th>
                <th className="text-right px-4 py-3 font-medium">Review Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {journalProfiles.map(j => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-800">{j.name}</td>
                  <td className="px-4 py-3 text-slate-500">{j.publisher}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${j.impactFactor >= 5 ? 'text-emerald-600' : j.impactFactor >= 2.5 ? 'text-blue-600' : 'text-slate-700'}`}>
                      {j.impactFactor}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{j.acceptanceRate}%</td>
                  <td className="px-4 py-3 text-right text-slate-600">{j.reviewWeeks} wks</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">⚙️ Context Budget Rules (RULE-024)</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700">Stage 1 (Literature): Max MCPs Active</label>
                  <span className="text-sm font-bold text-blue-600">{maxContextStage1}</span>
                </div>
                <input
                  type="range" min={5} max={20} value={maxContextStage1}
                  onChange={e => setMaxContextStage1(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>5</span><span>20</span></div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700">Stage 4 (CFD Evidence): Max MCPs Active</label>
                  <span className="text-sm font-bold text-blue-600">{maxContextStage4}</span>
                </div>
                <input
                  type="range" min={4} max={12} value={maxContextStage4}
                  onChange={e => setMaxContextStage4(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>4</span><span>12</span></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-3 mb-4">⏱ Agent Timeouts</h3>
            <div className="space-y-2.5">
              {[
                { agent: 'PipelineOrchestrator', timeout: '72 hours' },
                { agent: 'LiteratureHarvestAgent', timeout: '4 hours' },
                { agent: 'CFDSolverAgent', timeout: '15 min/run' },
                { agent: 'SectionWriterAgent', timeout: '2 hours' },
                { agent: 'ReviewerA/B/C/DAgent', timeout: '1 hour each' },
              ].map(a => (
                <div key={a.agent} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <span className="text-sm font-mono text-slate-700">{a.agent}</span>
                  <span className="text-sm font-medium text-blue-600">{a.timeout}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'integrity' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="font-bold text-red-800 mb-2">⚖️ ARTICLE I: ABSOLUTE PROHIBITIONS</div>
            <p className="text-xs text-red-700">These rules are enforced by the PreToolUse integrity hook. Violations result in immediate pipeline HALT. No override is possible.</p>
          </div>
          {[
            { rule: 'RULE-001', title: 'Zero Fabrication', desc: 'NEVER fabricate, hallucinate, or invent any numerical result. Every number traces to VerifiedRegistry.', status: 'enforced' },
            { rule: 'RULE-002', title: 'Citation Verification', desc: 'NEVER add a reference that has not been DOI-resolved by LiteratureArchaeologyAgent. Citation hallucination = pipeline HALT.', status: 'enforced' },
            { rule: 'RULE-003', title: 'HITL Gates', desc: 'NEVER bypass a Human-in-the-Loop gate. 11 mandatory gates per pipeline. No auto-approval.', status: 'enforced' },
            { rule: 'RULE-004', title: 'AI Authorship Prohibited', desc: 'NEVER list an AI system as a paper author. AI disclosure statement is ALWAYS generated and included.', status: 'enforced' },
            { rule: 'RULE-005', title: 'Journal Scope Validation', desc: 'NEVER submit to a journal outside its declared scope. JournalComplianceAgent must validate scope fit ≥ 7.0/10.', status: 'enforced' },
            { rule: 'RULE-040', title: 'No Hardcoded Secrets', desc: 'API keys, credentials must use environment variables only. PreToolUse hook blocks any write containing secret patterns.', status: 'enforced' },
            { rule: 'RULE-043', title: 'Append-Only Registry', desc: 'VerifiedRegistry is append-only. No record may be deleted or modified. Enforced at database level.', status: 'enforced' },
          ].map(r => (
            <div key={r.rule} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-start gap-4">
              <div className="shrink-0">
                <span className="text-xs font-bold font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">{r.rule}</span>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-800 text-sm">{r.title}</div>
                <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
              </div>
              <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                ✓ {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
