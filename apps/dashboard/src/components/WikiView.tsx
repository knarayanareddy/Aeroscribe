import type { WikiArticle } from '@aeroscribe/pipeline';
import { useId, useState } from 'react';
import { mockWikiArticles } from '../data/mockData';
import { usePipeline } from '../state/pipelineContext';
import WikiLive from './WikiLive';
import Markdown from './Markdown';

interface ArticleBody {
  body: string;
  related: string[];
}

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
    related: [
      'Pressure-Gain Combustion Cycles',
      'Detonation Cell Width — Measurement Methods',
      'Stratospheric Combustion Limits',
    ],
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
  const [articles, setArticles] = useState<WikiArticle[]>(mockWikiArticles);
  const [contentById, setContentById] = useState<Record<string, ArticleBody>>(articleContent);
  const [selectedId, setSelectedId] = useState(mockWikiArticles[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const searchId = useId();
  const editorId = useId();

  const { mode } = usePipeline();

  if (mode === 'live') return <WikiLive />;

  const selected = articles.find((article) => article.id === selectedId) ?? articles[0];
  const content = selected ? contentById[selected.id] : undefined;

  const filtered = articles.filter(
    (article) =>
      article.title.toLowerCase().includes(search.toLowerCase()) ||
      article.category.toLowerCase().includes(search.toLowerCase()),
  );

  const categories = Array.from(new Set(articles.map((article) => article.category)));

  const startEditing = () => {
    setDraft(content?.body ?? '');
    setEditMode(true);
    setNote(null);
  };

  const saveDraft = () => {
    if (!selected) return;
    setContentById((current) => ({
      ...current,
      [selected.id]: { body: draft, related: current[selected.id]?.related ?? [] },
    }));
    setArticles((current) =>
      current.map((article) =>
        article.id === selected.id
          ? { ...article, lastUpdated: new Date().toISOString().slice(0, 10) }
          : article,
      ),
    );
    setEditMode(false);
    setNote('Saved in this browser session only — the wiki service is not connected yet.');
  };

  const createArticle = () => {
    const id = `wiki-draft-${Date.now()}`;
    const article: WikiArticle = {
      id,
      title: 'Untitled article',
      category: 'Draft',
      lastUpdated: new Date().toISOString().slice(0, 10),
      papersLinked: 0,
      status: 'draft',
    };

    setArticles((current) => [article, ...current]);
    setContentById((current) => ({ ...current, [id]: { body: '', related: [] } }));
    setSelectedId(id);
    setDraft('');
    setEditMode(true);
    setNote('New draft created locally. It is not persisted or shared.');
  };

  const published = articles.filter((article) => article.status === 'published').length;
  const drafts = articles.filter((article) => article.status === 'draft').length;
  const linkedPapers = articles.reduce((total, article) => total + article.papersLinked, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AeroWiki</h1>
          <p className="mt-1 text-slate-500">
            Compounding knowledge base · local editing only, nothing is persisted
          </p>
        </div>
        <button
          type="button"
          onClick={createArticle}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 4v16m8-8H4" strokeLinecap="round" />
          </svg>
          New article
        </button>
      </div>

      {note && (
        <p
          role="status"
          className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800"
        >
          {note}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Published articles', value: published },
          { label: 'Draft articles', value: drafts },
          { label: 'Papers linked', value: linkedPapers },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm"
          >
            <dd className="text-2xl font-bold text-slate-900">{stat.value}</dd>
            <dt className="mt-1 text-xs text-slate-500">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-label="Article list" className="space-y-3 lg:col-span-1">
          <div>
            <label htmlFor={searchId} className="sr-only">
              Search articles
            </label>
            <div className="relative">
              <svg
                className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx={11} cy={11} r={8} />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search articles…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No articles match “{search}”.
            </p>
          )}

          {categories.map((category) => {
            const categoryArticles = filtered.filter((article) => article.category === category);
            if (categoryArticles.length === 0) return null;

            return (
              <div key={category}>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {category}
                </h2>
                <ul className="space-y-1.5">
                  {categoryArticles.map((article) => {
                    const isSelected = selected?.id === article.id;
                    return (
                      <li key={article.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(article.id);
                            setEditMode(false);
                            setNote(null);
                          }}
                          aria-pressed={isSelected}
                          className={`w-full rounded-xl border p-3 text-left transition-all ${
                            isSelected
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-slate-100 bg-white hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${article.status === 'published' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                              aria-hidden="true"
                            />
                            <span className="line-clamp-1 flex-1 text-sm font-medium text-slate-800">
                              {article.title}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 pl-3.5 text-xs text-slate-400">
                            <span>{article.papersLinked} papers</span>
                            <span aria-hidden="true">·</span>
                            <span>{article.lastUpdated}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        <section aria-label="Article content" className="lg:col-span-2">
          {!selected ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Select an article to read it.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        selected.status === 'published'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {selected.status}
                    </span>
                    <span className="text-xs text-slate-400">{selected.category}</span>
                    <span className="text-xs text-slate-400">· updated {selected.lastUpdated}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{selected.title}</h2>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => (editMode ? setEditMode(false) : startEditing())}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {editMode ? 'Cancel' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Version history requires the wiki service, which is not implemented yet"
                    className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400"
                  >
                    History
                  </button>
                </div>
              </div>

              <div className="max-h-[32rem] overflow-y-auto p-4 sm:p-6">
                {editMode ? (
                  <div className="space-y-3">
                    <label htmlFor={editorId} className="block text-sm font-medium text-slate-700">
                      Article body (markdown subset: **bold**, *italic*, `code`, - lists)
                    </label>
                    <textarea
                      id={editorId}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={16}
                      className="w-full rounded-lg border border-slate-200 p-3 font-mono text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveDraft}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Save draft
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMode(false)}
                        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ) : content ? (
                  <div>
                    <Markdown source={content.body} />

                    {content.related.length > 0 && (
                      <div className="mt-8 border-t border-slate-100 pt-4">
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          🔗 Related articles
                        </h3>
                        <ul className="flex flex-wrap gap-2">
                          {content.related.map((relatedTitle) => {
                            const related = articles.find(
                              (article) => article.title === relatedTitle,
                            );
                            return (
                              <li key={relatedTitle}>
                                <button
                                  type="button"
                                  disabled={!related}
                                  onClick={() => related && setSelectedId(related.id)}
                                  className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {relatedTitle}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="mt-6 border-t border-slate-100 pt-4">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        📎 Linked papers ({selected.papersLinked})
                      </h3>
                      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                        Source links are illustrative in this prototype; the wiki service will
                        attach verified registry entries here.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">
                    No content yet. Use “Edit” to write the first draft.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
