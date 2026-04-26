import { useState } from 'react';
import { mockWikiArticles } from '../data/mockData';

const articleContent: Record<string, { body: string; related: string[] }> = {
  'wiki-001': {
    body: `A **Rotating Detonation Engine (RDE)** is a pressure-gain combustion device that exploits one or more continuously rotating detonation waves propagating azimuthally in an annular combustor. Unlike pulse detonation engines (PDEs), which operate in a batch-cycle mode, RDEs sustain near-continuous thrust generation.

**Operating Principle**

Detonation waves propagate at the Chapman-Jouguet (CJ) velocity (~1,800–2,200 m/s for H₂-air mixtures) circumferentially within the annular gap. Fresh reactants are injected radially from the inner wall and fill the volume behind the preceding wave, allowing the next detonation to sustain itself continuously.

**Thermodynamic Advantages**

The thermodynamic cycle of an RDE approximates the Fickett-Jacobs (FJ) cycle rather than the Brayton cycle, yielding a theoretical specific impulse advantage of 15–25% for a given propellant combination.

**Key Parameters**
- Annular diameter: typically 50–200 mm
- Channel width: 5–15 mm  
- Operating pressure: 1–50 bar
- Wave count: 1–8 waves depending on geometry

**Papers linked from AeroScribe pipelines:** Nakamura et al. (2023), Liu et al. (2024), Andrus et al. (2023), Kaemming & Paxson (2024)...`,
    related: ['Pressure-Gain Combustion Cycles', 'Detonation Cell Width — Measurement Methods', 'Stratospheric Combustion Limits'],
  },
  'wiki-002': {
    body: `The **detonation cell width** (λ) is a fundamental measure of the detonability of a combustible mixture. It corresponds to the average transverse spacing between triple points in the detonation wave's cellular structure, visible as diamond-shaped patterns on soot-foil records.

**Measurement Methods**

1. **Soot Foil Records** — smoke-coated foil placed inside the detonation tube captures fish-scale patterns whose average cell width is measured optically.
2. **Obstacle Method** — critical diameter at which detonation can diffract around bluff bodies scales with cell width (~13λ rule).
3. **Pressure Transducer Array** — high-frequency PCB transducers record triple-point passage; cell width estimated from transducer spacing and wave speed.
4. **CFD / DNS** — reactive Euler or Navier-Stokes simulations with detailed kinetics can predict cellular structure directly.

**Scaling Laws**

For H₂-air mixtures at 1 atm:
- λ ≈ 7 mm at φ = 1.0 (stoichiometric)
- λ increases sharply below φ < 0.5 (lean) and above φ > 2.5 (rich)
- Pressure dependence: λ ∝ p^(-0.8) (empirical)`,
    related: ['Rotating Detonation Engine (RDE)', 'Pressure-Gain Combustion Cycles'],
  },
  'wiki-003': {
    body: `**Pressure-Gain Combustion (PGC)** refers to thermodynamic cycles where the combustion process results in a net stagnation pressure rise across the combustor, in contrast to conventional gas turbine combustors which operate at nearly constant pressure.

**Types of PGC Devices**
- Rotating Detonation Engines (RDE)
- Pulse Detonation Engines (PDE)
- Wave Rotor Combustors
- Shockless Explosion Combustors (SEC)

**Thermodynamic Benefit**

The Humphrey cycle (constant-volume combustion) achieves thermal efficiencies of 45–55% vs. 30–40% for the Brayton cycle at the same temperature ratio, representing a fundamental thermodynamic advantage for detonation-based propulsion.`,
    related: ['Rotating Detonation Engine (RDE)', 'Detonation Cell Width — Measurement Methods'],
  },
};

export default function WikiView() {
  const [articles] = useState(mockWikiArticles);
  const [selected, setSelected] = useState(mockWikiArticles[0]);
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);

  const filtered = articles.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = Array.from(new Set(articles.map(a => a.category)));

  const content = articleContent[selected.id];

  const renderMarkdown = (text: string) => {
    return text
      .split('\n\n')
      .map((para, i) => {
        if (para.startsWith('**') && para.endsWith('**') && !para.slice(2, -2).includes('\n')) {
          return <h3 key={i} className="text-base font-bold text-slate-900 mt-5 mb-2">{para.slice(2, -2)}</h3>;
        }
        const formatted = para
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono text-slate-700">$1</code>');
        if (para.startsWith('- ') || para.startsWith('1.')) {
          const items = para.split('\n').map(line => line.replace(/^[-\d.]+\s/, ''));
          return (
            <ul key={i} className="list-disc list-inside space-y-1 ml-2 my-2">
              {items.map((item, j) => (
                <li key={j} className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </ul>
          );
        }
        return <p key={i} className="text-sm text-slate-700 leading-relaxed my-2" dangerouslySetInnerHTML={{ __html: formatted }} />;
      });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AeroWiki</h1>
          <p className="text-slate-500 mt-1">Compounding knowledge base — auto-updated by WikiCompilerAgent after each pipeline run</p>
        </div>
        <button className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeLinecap="round" />
          </svg>
          New Article
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Published Articles', value: articles.filter(a => a.status === 'published').length.toString() },
          { label: 'Draft Articles', value: articles.filter(a => a.status === 'draft').length.toString() },
          { label: 'Papers Linked', value: articles.reduce((a, w) => a + w.papersLinked, 0).toString() },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Article list */}
        <div className="col-span-1 space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search articles..."
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {categories.map(cat => {
            const catArticles = filtered.filter(a => a.category === cat);
            if (!catArticles.length) return null;
            return (
              <div key={cat}>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">{cat}</div>
                {catArticles.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className={`w-full text-left p-3 rounded-xl border transition-all mb-1.5 ${
                      selected.id === a.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.status === 'published' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="text-sm font-medium text-slate-800 flex-1 line-clamp-1">{a.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-3.5">
                      <span className="text-xs text-slate-400">{a.papersLinked} papers</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{a.lastUpdated}</span>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Article content */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    selected.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selected.status}
                  </span>
                  <span className="text-xs text-slate-400">{selected.category}</span>
                  <span className="text-xs text-slate-400">· Last updated {selected.lastUpdated}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">{selected.title}</h2>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => setEditMode(!editMode)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {editMode ? 'Preview' : 'Edit'}
                </button>
                <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">
                  History
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[500px] overflow-y-auto">
              {content ? (
                <div>
                  <div className="prose prose-sm max-w-none">
                    {renderMarkdown(content.body)}
                  </div>

                  {content.related.length > 0 && (
                    <div className="mt-8 pt-4 border-t border-slate-100">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">🔗 Related Articles</div>
                      <div className="flex flex-wrap gap-2">
                        {content.related.map(r => (
                          <button
                            key={r}
                            onClick={() => {
                              const a = articles.find(x => x.title === r);
                              if (a) setSelected(a);
                            }}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">📎 Linked Papers ({selected.papersLinked})</div>
                    <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                      This article was synthesized from {selected.papersLinked} DOI-verified papers processed by AeroScribe pipeline runs. All claims trace to VerifiedRegistry entries.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="text-4xl mb-4">📝</div>
                  <p className="text-slate-500 text-sm">Article content being compiled by WikiCompilerAgent</p>
                  <p className="text-slate-400 text-xs mt-1">Will be available after pipeline Stage 8 completes</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
