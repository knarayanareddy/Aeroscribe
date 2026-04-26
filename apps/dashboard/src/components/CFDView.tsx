import { useState } from 'react';
import { mockCFDResults } from '../data/mockData';

export default function CFDView() {
  const [activeTab, setActiveTab] = useState<'results' | 'convergence' | 'registry'>('results');

  // Simulated convergence data
  const convergenceData = [
    { iter: 100, residual: 1.2e-2, lift: 0.44, drag: 0.082 },
    { iter: 200, residual: 4.1e-3, lift: 0.47, drag: 0.079 },
    { iter: 400, residual: 8.3e-4, lift: 0.482, drag: 0.076 },
    { iter: 600, residual: 2.1e-4, lift: 0.489, drag: 0.0745 },
    { iter: 800, residual: 6.4e-5, lift: 0.492, drag: 0.0738 },
    { iter: 1000, residual: 1.9e-5, lift: 0.494, drag: 0.0734 },
    { iter: 1200, residual: 5.8e-6, lift: 0.4952, drag: 0.0731 },
    { iter: 1400, residual: 1.7e-6, lift: 0.4961, drag: 0.0729 },
    { iter: 1600, residual: 5.1e-7, lift: 0.4968, drag: 0.0728 },
    { iter: 1800, residual: 1.5e-7, lift: 0.4972, drag: 0.0727 },
    { iter: 2000, residual: 4.4e-8, lift: 0.4975, drag: 0.0726 },
    { iter: 2400, residual: 1.2e-8, lift: 0.4977, drag: 0.0726 },
  ];

  const gridStudy = [
    { level: 'Coarse (L1)', cells: '1.2M', wavespeed: '1798', Isp: '4201', gci: '3.84%' },
    { level: 'Medium (L2)', cells: '4.9M', wavespeed: '1831', Isp: '4278', gci: '1.21%' },
    { level: 'Fine (L3)', cells: '12.4M', wavespeed: '1842', Isp: '4312', gci: '0.38%' },
    { level: 'Extra Fine (L4)', cells: '49.6M', wavespeed: '1845', Isp: '4319', gci: '—' },
  ];

  // Simple sparkline path
  const maxVal = Math.max(...convergenceData.map(d => -Math.log10(d.residual)));
  const minVal = Math.min(...convergenceData.map(d => -Math.log10(d.residual)));
  const w = 360, h = 80;
  const points = convergenceData.map((d, i) => {
    const x = (i / (convergenceData.length - 1)) * w;
    const y = h - (((-Math.log10(d.residual)) - minVal) / (maxVal - minVal)) * (h - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Evidence Generation — CFD</h1>
        <p className="text-slate-500 mt-1">All results SHA256-verified · VerifiedRegistry integrity chain enforced</p>
      </div>

      {/* Status banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4">
        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-blue-800">CFD Solver Running — run-003 (Hypersonic BL Transition)</div>
          <div className="text-xs text-blue-600 mt-0.5">Level 2/4 mesh refinement · Runtime: 3h 22m · Residual: 4.2×10⁻⁴</div>
        </div>
        <div className="text-sm text-blue-700 font-medium shrink-0">~2h remaining</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { id: 'results', label: 'Verified Results' },
          { id: 'convergence', label: 'Convergence' },
          { id: 'registry', label: 'VerifiedRegistry' },
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

      {activeTab === 'results' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {mockCFDResults.slice(0, 3).map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 font-medium mb-1">{r.name}</div>
                <div className="text-3xl font-black text-slate-900">{r.value.toLocaleString()}</div>
                <div className="text-sm text-slate-500">{r.unit}</div>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    ±{r.uncertainty} ({r.confidence}% CI, {r.method.split(',')[0]})
                  </div>
                  <div className="mt-2 text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Registry verified
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">All Verified CFD Results — run-001</h3>
              <p className="text-xs text-slate-500 mt-0.5">RULE-031 compliant: value ± uncertainty (confidence%, method)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Quantity</th>
                    <th className="text-right px-4 py-3 font-medium">Value ± σ</th>
                    <th className="text-right px-4 py-3 font-medium">Unit</th>
                    <th className="text-right px-4 py-3 font-medium">CI</th>
                    <th className="text-left px-4 py-3 font-medium">Method</th>
                    <th className="text-left px-4 py-3 font-medium">SHA256</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mockCFDResults.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {r.value.toLocaleString()} ± {r.uncertainty}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 font-mono">{r.unit}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{r.confidence}%</td>
                      <td className="px-4 py-3 text-slate-600 text-xs max-w-[180px]">{r.method}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-mono text-xs text-slate-400 truncate max-w-[100px]">{r.sha256}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'convergence' && (
        <div className="space-y-4">
          {/* Convergence chart */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-1">Solver Residual Convergence</h3>
            <p className="text-xs text-slate-500 mb-4">L² norm of momentum residuals · Target: &lt;10⁻⁶</p>
            <div className="bg-slate-900 rounded-xl p-4 relative" style={{ height: 120 }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="residual-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Target line */}
                <line x1="0" y1={h - ((6 - minVal) / (maxVal - minVal)) * (h - 10) - 5} x2={w} y2={h - ((6 - minVal) / (maxVal - minVal)) * (h - 10) - 5} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.5} opacity={0.7} />
              </svg>
              <div className="absolute top-3 right-3 flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-blue-400"><span className="w-3 h-0.5 bg-blue-400 inline-block" /> Residual</span>
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-3 h-0.5 bg-emerald-400 border-dashed border inline-block" /> Target</span>
              </div>
              <div className="absolute bottom-3 right-3 text-xs text-emerald-400 font-semibold">✓ Converged at iter 2400</div>
            </div>
          </div>

          {/* Grid convergence study */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Grid Convergence Study (Richardson Extrapolation)</h3>
              <p className="text-xs text-slate-500 mt-0.5">GCI &lt; 1% required for manuscript use (GATE-4A criterion)</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Grid Level</th>
                  <th className="text-right px-4 py-3 font-medium">Cells</th>
                  <th className="text-right px-4 py-3 font-medium">Wave Speed (m/s)</th>
                  <th className="text-right px-4 py-3 font-medium">Isp (s)</th>
                  <th className="text-right px-4 py-3 font-medium">GCI</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gridStudy.map((g, i) => (
                  <tr key={g.level} className={i === 2 ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                    <td className="px-5 py-3 font-medium text-slate-800">{g.level}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{g.cells}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{g.wavespeed}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{g.Isp}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${
                      g.gci === '—' ? 'text-slate-400' :
                      parseFloat(g.gci) < 1 ? 'text-emerald-600' :
                      parseFloat(g.gci) < 2 ? 'text-amber-600' : 'text-red-600'
                    }`}>{g.gci}</td>
                    <td className="px-4 py-3 text-center">
                      {i === 2 ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ Selected</span>
                      ) : i === 3 ? (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Reference</span>
                      ) : (
                        <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">GCI too high</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100">
              <p className="text-xs text-emerald-700 font-medium">
                ✓ L3 grid selected (GCI = 0.38%) · Richardson extrapolated value: 1,847 ± 12.4 m/s (95% CI) · Registered in VerifiedRegistry
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <span className="font-bold">🔐 VerifiedRegistry</span> — Append-only. No record may be deleted or modified after creation (RULE-043). All CFD outputs are SHA256-checksummed before manuscript use.
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Registry Entries — run-001</h3>
            </div>
            <div className="divide-y divide-slate-50 font-mono text-xs">
              {mockCFDResults.map((r, i) => (
                <div key={r.id} className="px-5 py-3 grid grid-cols-4 gap-4 hover:bg-slate-50">
                  <div className="col-span-1">
                    <div className="text-slate-500 text-[10px] mb-0.5">REGISTRY ID</div>
                    <div className="text-slate-700">VR-{String(i + 1).padStart(4, '0')}</div>
                  </div>
                  <div className="col-span-1">
                    <div className="text-slate-500 text-[10px] mb-0.5">QUANTITY</div>
                    <div className="text-slate-800 font-sans font-medium text-xs">{r.name}</div>
                  </div>
                  <div className="col-span-1">
                    <div className="text-slate-500 text-[10px] mb-0.5">SHA256</div>
                    <div className="text-slate-500">{r.sha256}</div>
                  </div>
                  <div className="col-span-1 text-right">
                    <div className="text-slate-500 text-[10px] mb-0.5">STATUS</div>
                    <div className="inline-flex items-center gap-1 text-emerald-600">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      VERIFIED
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
