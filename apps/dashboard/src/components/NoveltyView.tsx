import { useState } from 'react';
import { mockResearchGaps } from '../data/mockData';

export default function NoveltyView() {
  const [selectedGap, setSelectedGap] = useState(mockResearchGaps[0]);

  const riskColors: Record<string, string> = {
    low: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    medium: 'bg-amber-50 text-amber-600 border-amber-200',
    high: 'bg-red-50 text-red-600 border-red-200',
  };

  const scoreBar = (score: number, max = 10) => {
    const pct = (score / max) * 100;
    const color = score >= 9 ? 'bg-emerald-500' : score >= 8 ? 'bg-blue-500' : score >= 7 ? 'bg-violet-500' : 'bg-amber-500';
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-800 w-8 text-right">{score}</span>
      </div>
    );
  };

  // Simulate a gap matrix visualization
  const phenomena = ['Wave Stability', 'Cell Width', 'Multi-wave Mode', 'Fuel Mixing', 'Ignition', 'Detonation Speed'];
  const methodologies = ['CFD (DNS)', 'CFD (RANS)', 'Shock Tube', 'Linear Theory', 'ML Surrogate', 'Experiment'];
  const covered: Record<string, boolean> = {
    'Wave Stability-Linear Theory': true,
    'Wave Stability-CFD (RANS)': true,
    'Cell Width-Shock Tube': true,
    'Cell Width-Experiment': true,
    'Multi-wave Mode-CFD (RANS)': true,
    'Detonation Speed-Experiment': true,
    'Detonation Speed-CFD (RANS)': true,
    'Ignition-Experiment': true,
    'Fuel Mixing-CFD (RANS)': true,
    'Multi-wave Mode-Experiment': true,
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Novelty Detection</h1>
        <p className="text-slate-500 mt-1">Research gap analysis · Contradiction detection · Novelty certification</p>
      </div>

      {/* Novelty Certificate */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-widest text-violet-200 mb-2">📜 Novelty Certificate — run-001</div>
            <h2 className="text-xl font-bold mb-3">
              "First CFD-validated study of RDE combustion stability at stratospheric pressure conditions."
            </h2>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-3xl font-black">8.7</div>
                <div className="text-xs text-violet-200 mt-1">Novelty Score / 10</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-xl font-bold text-emerald-300">LOW</div>
                <div className="text-xs text-violet-200 mt-1">Preemption Risk</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-xl font-bold">4</div>
                <div className="text-xs text-violet-200 mt-1">Gaps Identified</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/20 text-xs text-violet-200">
          ✓ 0 arXiv preprints found in last 90 days &nbsp;·&nbsp; ✓ 0 competitor group publications in 6 months &nbsp;·&nbsp; ✓ GATE-2 awaiting researcher approval
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Gap Matrix */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Research Gap Matrix</h3>
            <p className="text-xs text-slate-500 mt-0.5">Phenomena × Methodologies — empty cells = candidate gaps</p>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left text-slate-500 font-medium py-1 pr-3 w-32">Phenomena ↓</th>
                  {methodologies.map(m => (
                    <th key={m} className="text-center text-slate-500 font-medium py-1 px-1 text-[10px] writing-vertical" style={{ minWidth: '52px' }}>
                      <div className="transform -rotate-45 origin-left translate-x-2 translate-y-3 whitespace-nowrap text-[9px]">{m}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phenomena.map((ph, pi) => (
                  <tr key={ph} className={pi % 2 === 0 ? 'bg-slate-50/50' : ''}>
                    <td className="text-slate-700 font-medium py-2 pr-3 text-[10px] whitespace-nowrap">{ph}</td>
                    {methodologies.map(me => {
                      const key = `${ph}-${me}`;
                      const isCovered = covered[key];
                      const isGap = ph === 'Wave Stability' && me === 'CFD (DNS)';
                      return (
                        <td key={me} className="text-center py-2 px-1">
                          <div className={`w-8 h-6 mx-auto rounded flex items-center justify-center text-[10px] font-bold ${
                            isGap
                              ? 'bg-violet-100 text-violet-600 border-2 border-violet-400 border-dashed'
                              : isCovered
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-slate-100 text-slate-300'
                          }`}>
                            {isGap ? '★' : isCovered ? '✓' : '·'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 inline-block border border-emerald-200" /> Covered</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-100 inline-block border-2 border-violet-400 border-dashed" /> ★ Primary Gap</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 inline-block" /> Uncovered</span>
            </div>
          </div>
        </div>

        {/* Gaps list */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Candidate Research Gaps</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {mockResearchGaps.map(gap => (
                <button
                  key={gap.id}
                  onClick={() => setSelectedGap(gap)}
                  className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors ${selectedGap?.id === gap.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskColors[gap.competitorRisk]}`}>
                          {gap.competitorRisk.toUpperCase()} RISK
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 line-clamp-2">{gap.phenomena}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">Missing: {gap.missingMethodology}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-black text-violet-600">{gap.noveltyScore}</div>
                      <div className="text-[10px] text-slate-400">novelty</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected gap detail */}
          {selectedGap && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h4 className="font-bold text-slate-900 text-sm">{selectedGap.phenomena}</h4>

              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Novelty Score</div>
                {scoreBar(selectedGap.noveltyScore)}
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs font-semibold text-slate-600 mb-1">Missing Methodology</div>
                <p className="text-xs text-slate-700">{selectedGap.missingMethodology}</p>
              </div>

              <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                <div className="text-xs font-semibold text-violet-700 mb-1">💡 AeroScribe Recommendation</div>
                <p className="text-xs text-violet-800">{selectedGap.recommendation}</p>
              </div>

              <div className={`text-xs px-3 py-2 rounded-lg border font-medium text-center ${riskColors[selectedGap.competitorRisk]}`}>
                Competitor Risk: {selectedGap.competitorRisk.toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contradictions */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Contradiction Detection</h3>
        </div>
        <div className="p-5 space-y-4">
          {[
            {
              p1: 'Smith & Chen (2024)', p2: 'Ng & Zhang (2022)',
              claim1: 'Detonation cell width decreases monotonically with pressure (1–20 atm)',
              claim2: 'Cell width exhibits non-monotonic behavior near stoichiometric H₂-air at elevated pressure',
              score: 0.72, topic: 'Detonation Cell Behavior'
            },
            {
              p1: 'Liu et al. (2024)', p2: 'Andrus et al. (2023)',
              claim1: 'Multi-wave mode is stabilized at back-pressures above 3 bar',
              claim2: 'Wave count is independent of ambient back-pressure; determined solely by injector configuration',
              score: 0.61, topic: 'RDE Wave Mode'
            },
          ].map((c, i) => (
            <div key={i} className="grid grid-cols-5 gap-3 items-center">
              <div className="col-span-2 bg-red-50 rounded-lg p-3 border border-red-100">
                <div className="text-xs font-bold text-red-600 mb-1">{c.p1}</div>
                <p className="text-xs text-red-800">"{c.claim1}"</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <div className="text-lg">⚡</div>
                <div className="text-xs font-bold text-slate-700">{(c.score * 100).toFixed(0)}%</div>
                <div className="text-[9px] text-slate-400">conflict</div>
                <div className="text-[9px] text-slate-500 text-center mt-1">{c.topic}</div>
              </div>
              <div className="col-span-2 bg-amber-50 rounded-lg p-3 border border-amber-100">
                <div className="text-xs font-bold text-amber-600 mb-1">{c.p2}</div>
                <p className="text-xs text-amber-800">"{c.claim2}"</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
