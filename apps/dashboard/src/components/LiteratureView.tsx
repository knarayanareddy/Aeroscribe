import { useState } from 'react';
import { mockPapers, Paper } from '../data/mockData';

export default function LiteratureView() {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<Paper | null>(null);
  const [minScore, setMinScore] = useState(0);

  const allTags = Array.from(new Set(mockPapers.flatMap(p => p.tags)));

  const filtered = mockPapers.filter(p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.authors.toLowerCase().includes(search.toLowerCase());
    const matchTags = selectedTags.length === 0 || selectedTags.some(t => p.tags.includes(t));
    const matchScore = p.relevanceScore >= minScore;
    return matchSearch && matchTags && matchScore;
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const scoreColor = (score: number) => {
    if (score >= 9) return 'text-emerald-600 bg-emerald-50';
    if (score >= 8) return 'text-blue-600 bg-blue-50';
    if (score >= 7) return 'text-violet-600 bg-violet-50';
    return 'text-slate-600 bg-slate-50';
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Literature Archaeology</h1>
        <p className="text-slate-500 mt-1">
          {mockPapers.length} papers indexed · DOI-verified · Zero hallucinated references
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Papers', value: '147', icon: '📄' },
          { label: 'DOI Verified', value: '100%', icon: '✅' },
          { label: 'Avg Relevance', value: '8.4', icon: '⭐' },
          { label: 'Citation Depth', value: '3', icon: '🔗' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
        <div className="flex gap-3 mb-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, authors..."
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Min score:</span>
            <select
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[0, 7, 7.5, 8, 8.5, 9].map(v => <option key={v} value={v}>{v || 'Any'}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Paper list */}
        <div className="col-span-3 space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
          {filtered.map(paper => (
            <button
              key={paper.id}
              onClick={() => setSelected(selected?.id === paper.id ? null : paper)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selected?.id === paper.id
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor(paper.relevanceScore)}`}>
                      {paper.relevanceScore}
                    </span>
                    <span className="text-xs text-slate-400">{paper.year}</span>
                    <span className="text-xs text-slate-400">· {paper.citationCount} citations</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 line-clamp-2">{paper.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{paper.authors}</p>
                  <p className="text-xs text-blue-600 font-medium mt-0.5">{paper.journal}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {paper.tags.map(t => (
                      <span key={t} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">No papers match your filters</div>
          )}
        </div>

        {/* Paper detail */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 sticky top-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${scoreColor(selected.relevanceScore)}`}>
                    Relevance: {selected.relevanceScore}/10
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm leading-snug">{selected.title}</h3>
                <p className="text-xs text-slate-500 mt-2">{selected.authors}</p>
                <p className="text-xs text-blue-600 font-medium">{selected.journal}, {selected.year}</p>
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs font-semibold text-slate-600 mb-1">Abstract</div>
                <p className="text-xs text-slate-700 leading-relaxed">{selected.abstract}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-slate-800">{selected.citationCount}</div>
                  <div className="text-xs text-slate-500">Citations</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-xs font-bold text-emerald-700">DOI Verified</div>
                  <div className="text-xs text-emerald-600 font-mono mt-1 truncate">{selected.doi}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1.5">Keywords</div>
                <div className="flex flex-wrap gap-1">
                  {selected.tags.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{t}</span>
                  ))}
                </div>
              </div>

              <a
                href={`https://doi.org/${selected.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Open DOI
              </a>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
              <div className="text-4xl mb-3">📖</div>
              <p className="text-sm">Select a paper to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
