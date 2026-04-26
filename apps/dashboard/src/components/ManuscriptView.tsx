import { useState } from 'react';

const sections = [
  { id: 'abstract', label: 'Abstract', wordCount: 248, status: 'complete' },
  { id: 'nomenclature', label: 'Nomenclature', wordCount: 180, status: 'complete' },
  { id: 'introduction', label: 'I. Introduction', wordCount: 1840, status: 'complete' },
  { id: 'methodology', label: 'II. Computational Methodology', wordCount: 2340, status: 'complete' },
  { id: 'results', label: 'III. Results & Discussion', wordCount: 3120, status: 'in_review' },
  { id: 'conclusions', label: 'IV. Conclusions', wordCount: 640, status: 'draft' },
  { id: 'acknowledgments', label: 'Acknowledgments', wordCount: 120, status: 'draft' },
  { id: 'references', label: 'References', wordCount: 0, status: 'complete', refs: 68 },
];

const sectionContent: Record<string, string> = {
  abstract: `Rotating detonation engine (RDE) combustion stability at stratospheric conditions (altitude equivalent 15–35 km, ambient pressure 0.012–0.121 bar) is investigated using high-fidelity reactive Euler simulations with the GRI-Mech 3.0 kinetic mechanism. Three-dimensional CFD simulations of an annular RDE combustor (diameter: 76 mm, channel width: 10 mm) are conducted at equivalence ratios φ = 0.8, 1.0, and 1.2, with ambient back-pressures spanning three orders of magnitude. The detonation wave propagation speed is found to be 1,842 ± 12.4 m/s (95% CI, Richardson extrapolation, GCI = 0.38%) at sea-level-equivalent conditions, decreasing to 1,664 ± 18.7 m/s at 35 km altitude equivalent. A critical instability threshold is identified at p_∞ < 0.031 bar, below which the detonation wave transitions to a deflagration-dominated regime, characterized by cell instability parameter χ > 5.1. These findings establish, for the first time, quantitative operability limits for RDE propulsion in the stratospheric environment, providing design constraints for next-generation hypersonic air-breathing vehicles.`,
  nomenclature: `p — Pressure (Pa)\np∞ — Freestream/ambient pressure (Pa)\nφ — Equivalence ratio (—)\nλ — Detonation cell width (mm)\nχ — Cell instability parameter (—)\nIsp — Specific impulse (s)\nη_c — Combustion efficiency (—)\nCJ — Chapman-Jouguet (subscript)\nL/D — Lift-to-drag ratio (—)`,
  introduction: `Rotating detonation engines represent a disruptive advancement in pressure-gain combustion technology, offering thermodynamic cycle efficiency gains of 15–25% over conventional deflagration-based Brayton cycles [1,2]. The RDE concept, first demonstrated experimentally by Voitsekhovskii [3] and subsequently refined by Bykovskii et al. [4], exploits the supersonic nature of detonation waves to achieve near-constant-volume heat addition without the mechanical complexity of piston-based pressure-gain combustors.

Contemporary interest in RDE propulsion for atmospheric applications has been primarily focused on sea-level and low-altitude performance [5,6]. However, the emergence of hypersonic cruise vehicle concepts—including the DARPA HAWC program and Boeing X-51A successor concepts—demands RDE operability characterization at stratospheric conditions where ambient pressure falls below 0.1 bar [7]. At such conditions, the detonation cellular structure, wave propagation stability, and reactant fill characteristics are expected to deviate significantly from established sea-level correlations.

The fundamental challenge of high-altitude detonation combustion lies in the intersection of two competing effects: (1) the reduction in mixture density that decreases the specific impulse available for thrust generation, and (2) the alteration of the ZND detonation structure that governs stability margins. Ng and Zhang [8] demonstrated via linear perturbation analysis that the cell instability parameter χ, defined as the ratio of the post-shock induction length to the half-reaction length, governs the transition between regular and irregular detonation cellular structures. However, their analysis was constrained to pressures above 1 atm, leaving the sub-atmospheric regime entirely uncharacterized.

This study addresses this gap through three-dimensional reactive Euler CFD simulations of an annular RDE combustor across a pressure range spanning three orders of magnitude...`,
  methodology: `The computational domain represents a 76 mm diameter annular RDE combustor with a 10 mm channel width, periodic in the azimuthal direction. The governing equations are the three-dimensional reactive Euler equations with a detailed hydrogen-air kinetic mechanism (GRI-Mech 3.0, 325 reactions, 53 species).

**2.1 Governing Equations**

The reactive Euler equations in conservation form:
∂ρ/∂t + ∇·(ρu) = 0
∂(ρu)/∂t + ∇·(ρuu + pI) = 0  
∂(ρE)/∂t + ∇·((ρE + p)u) = ω̇_T
∂(ρY_k)/∂t + ∇·(ρY_k u) = ω̇_k

where ρ is density, u the velocity vector, p pressure, E total specific energy, Y_k the mass fraction of species k, ω̇_k the chemical source term, and ω̇_T the heat release rate.

**2.2 Numerical Methods**

Spatial discretization employs a 5th-order WENO scheme [9] with Roe-averaged flux computation. Time advancement uses the 3rd-order strong-stability-preserving Runge-Kutta method (SSP-RK3). Chemical source terms are integrated using VODE with absolute tolerance 10⁻¹⁴ and relative tolerance 10⁻¹⁰.

**2.3 Grid Convergence Study**

A systematic grid convergence study was performed on four mesh levels (Table 2), following the AIAA CFD Uncertainty Quantification standard [10]. The Grid Convergence Index (GCI) was computed via Richardson extrapolation:

GCI = F_s |ε| / (r^p - 1)

where F_s = 1.25 (safety factor), r = 2 (refinement ratio), p = 4.7 (observed order of convergence). The L3 mesh (12.4M cells) was selected as the production mesh, achieving GCI = 0.38% for detonation wave speed — well below the 1% threshold required for manuscript-quality results (GATE-4A criterion).`,
};

export default function ManuscriptView() {
  const [activeSection, setActiveSection] = useState('abstract');
  const [showLatex, setShowLatex] = useState(false);

  const totalWords = sections.filter(s => s.id !== 'references').reduce((a, s) => a + s.wordCount, 0);
  const targetWords = 10000;

  const statusColors: Record<string, string> = {
    complete: 'bg-emerald-100 text-emerald-700',
    in_review: 'bg-orange-100 text-orange-700',
    draft: 'bg-slate-100 text-slate-600',
    pending: 'bg-slate-100 text-slate-400',
  };

  const latexSnippet = `\\documentclass[conf]{aiaa-tc}
\\usepackage{amsmath,amssymb,graphicx,booktabs}

\\title{Detonation Cell Instability in RDEs Under Simulated Stratospheric Conditions:\\\\
A CFD-Validated Investigation}
\\author{K. Narayana Reddy%
  \\thanks{Corresponding Author, \\texttt{k.reddy@research.edu}}}

\\begin{document}
\\maketitle

\\begin{abstract}
Rotating detonation engine (RDE) combustion stability at stratospheric conditions
(altitude equivalent 15--35\\,km, ambient pressure 0.012--0.121\\,bar) is
investigated using high-fidelity reactive Euler simulations with the GRI-Mech 3.0
kinetic mechanism\\ldots
% [word count: 248 / 250 maximum]
\\end{abstract}

\\section{Introduction}
\\label{sec:intro}

Rotating detonation engines represent a disruptive advancement in pressure-gain
combustion technology, offering thermodynamic cycle efficiency gains of 15--25\\%
over conventional deflagration-based Brayton cycles~\\cite{Smith2024,Nakamura2023}.

\\begin{equation}
  \\text{GCI} = \\frac{F_s \\left| \\varepsilon \\right|}{r^p - 1}
  \\label{eq:gci}
\\end{equation}

% VerifiedRegistry SHA256: a3f8c1d2e4b6...9f01
% Value: 1842.3 +/- 12.4 m/s (95% CI, Richardson extrapolation)
The detonation wave propagation speed is $1842.3 \\pm 12.4$\\,m/s (95\\%\\,CI,
Richardson extrapolation, GCI = 0.38\\%)~\\cite{VerifiedRegistry-VR-0001}.`;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manuscript Synthesis</h1>
          <p className="text-slate-500 mt-1">Hierarchical 5-level writing pipeline · AIAA LaTeX · Zero-hallucination</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLatex(!showLatex)}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <span className="font-mono text-xs">LaTeX</span>
            {showLatex ? 'Hide' : 'View'} Source
          </button>
          <button className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">Manuscript Progress</div>
            <div className="text-xs text-slate-500 mt-0.5">{totalWords.toLocaleString()} / {targetWords.toLocaleString()} words · 68 references · 12 figures</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900">{Math.round((totalWords / targetWords) * 100)}%</div>
            <div className="text-xs text-slate-400">complete</div>
          </div>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all"
            style={{ width: `${Math.min((totalWords / targetWords) * 100, 100)}%` }}
          />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block mr-1" />Complete</span>
          <span><span className="w-2 h-2 rounded-full bg-orange-400 inline-block mr-1" />In Review</span>
          <span><span className="w-2 h-2 rounded-full bg-slate-300 inline-block mr-1" />Draft</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Section nav */}
        <div className="col-span-1 space-y-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Sections</div>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                activeSection === s.id
                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="font-medium text-left flex-1 truncate">{s.label}</span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {s.wordCount > 0 && <span className="text-xs text-slate-400">{s.wordCount}w</span>}
                {s.refs && <span className="text-xs text-slate-400">{s.refs} refs</span>}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColors[s.status]}`}>
                  {s.status === 'complete' ? '✓' : s.status === 'in_review' ? '⌛' : '✏'}
                </span>
              </div>
            </button>
          ))}

          {/* Journal compliance */}
          <div className="mt-4 bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-700 mb-3">📋 AIAA Compliance</div>
            {[
              { label: 'Abstract ≤ 250 words', ok: true, detail: '248 words' },
              { label: 'Nomenclature present', ok: true },
              { label: 'AIAA citation style', ok: true },
              { label: 'Uncertainty on all values', ok: false, detail: '7 values missing' },
              { label: 'AI disclosure included', ok: true },
              { label: 'Figure captions complete', ok: false, detail: 'Fig.6 scale bar' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 py-1">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs shrink-0 ${item.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                  {item.ok ? '✓' : '!'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-600">{item.label}</div>
                  {item.detail && <div className="text-xs text-slate-400">{item.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="col-span-2">
          {showLatex ? (
            <div className="bg-slate-900 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700">
                <span className="text-xs font-mono text-slate-400">manuscript.tex — AIAA LaTeX</span>
                <button onClick={() => setShowLatex(false)} className="text-slate-400 hover:text-white text-xs">Close</button>
              </div>
              <pre className="p-5 text-xs text-emerald-300 font-mono leading-relaxed overflow-auto max-h-[600px] whitespace-pre-wrap">
                {latexSnippet}
              </pre>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">{sections.find(s => s.id === activeSection)?.label}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {sections.find(s => s.id === activeSection)?.wordCount} words
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[sections.find(s => s.id === activeSection)?.status || 'pending']}`}>
                  {sections.find(s => s.id === activeSection)?.status?.replace('_', ' ')}
                </span>
              </div>
              <div className="p-6 max-h-[580px] overflow-y-auto">
                {sectionContent[activeSection] ? (
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-serif">
                      {sectionContent[activeSection]}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400">
                    <div className="text-4xl mb-3">✏️</div>
                    <p className="text-sm">Section in progress — SectionWriterAgent queued</p>
                    <p className="text-xs mt-1">Awaiting GATE-4C (Figure Set Approval)</p>
                  </div>
                )}

                {activeSection === 'abstract' && (
                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <div className="text-xs text-slate-500 font-semibold mb-3 uppercase tracking-wider">Abstract Structure Validation (RULE-034)</div>
                    {[
                      { n: 'S1', label: 'Problem + Motivation', ok: true },
                      { n: 'S2', label: 'Approach / Method', ok: true },
                      { n: 'S3', label: 'Key Quantitative Result', ok: true },
                      { n: 'S4', label: 'Significance / Broader Impact', ok: true },
                    ].map(s => (
                      <div key={s.n} className="flex items-center gap-2 py-1">
                        <span className="text-xs font-bold text-slate-400 w-6">{s.n}</span>
                        <span className="text-xs text-slate-600">{s.label}</span>
                        <span className="ml-auto text-emerald-500 text-xs">✓ Present</span>
                      </div>
                    ))}
                    <div className="mt-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                      ✓ 248/250 words · 4-sentence structure verified · AIAA-compliant
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
