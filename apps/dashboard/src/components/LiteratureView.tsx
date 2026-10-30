import { useId, useState } from 'react';
import { mockPapers } from '../data/mockData';
import { allTags, filterPapers } from '../lib/literature';

const scoreColors = (score: number) => {
  if (score >= 9) return 'bg-emerald-50 text-emerald-700';
  if (score >= 8) return 'bg-blue-50 text-blue-700';
  if (score >= 7) return 'bg-violet-50 text-violet-700';
  return 'bg-slate-50 text-slate-600';
};

const scoreOptions = [0, 7, 7.5, 8, 8.5, 9];

export default function LiteratureView() {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchId = useId();
  const scoreId = useId();

  const tags = allTags(mockPapers);
  const filtered = filterPapers(mockPapers, { search, tags: selectedTags, minScore });
  const selected = filtered.find((paper) => paper.id === selectedId) ?? null;

  const toggleTag = (tag: string) =>
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag],
    );

  const reset = () => {
    setSearch('');
    setSelectedTags([]);
    setMinScore(0);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Literature archaeology</h1>
        <p className="mt-1 text-slate-500">
          {mockPapers.length} illustrative papers · DOI resolution and harvesting are specified, not
          implemented
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-900">
          Fixture dataset. References and DOIs are sample values used to exercise the interface —
          they are not the output of a real harvest.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Papers in fixture', value: String(mockPapers.length) },
          {
            label: 'Median relevance',
            value: medianScore(mockPapers.map((paper) => paper.relevanceScore)),
          },
          { label: 'Tags', value: String(tags.length) },
          { label: 'Results shown', value: String(filtered.length) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm"
          >
            <dd className="text-xl font-bold text-slate-900">{stat.value}</dd>
            <dt className="mt-1 text-xs text-slate-500">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <section
        aria-label="Filters"
        className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor={searchId} className="sr-only">
              Search title, authors or tags
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
                placeholder="Search title, authors or tags…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={scoreId} className="text-sm text-slate-600">
              Min score
            </label>
            <select
              id={scoreId}
              value={minScore}
              onChange={(event) => setMinScore(Number(event.target.value))}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {scoreOptions.map((value) => (
                <option key={value} value={value}>
                  {value || 'Any'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={isSelected}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                }`}
              >
                {tag}
              </button>
            );
          })}
          {(search || selectedTags.length > 0 || minScore > 0) && (
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-label="Paper list" className="space-y-2 lg:col-span-2">
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No papers match these filters.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((paper) => (
                <li key={paper.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(paper.id)}
                    aria-pressed={selected?.id === paper.id}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      selected?.id === paper.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-800">
                          {paper.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {paper.authors} · {paper.journal} · {paper.year}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${scoreColors(paper.relevanceScore)}`}
                      >
                        {paper.relevanceScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {paper.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto text-xs text-slate-400">
                        {paper.citationCount} citations
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside aria-label="Paper details" className="lg:col-span-1">
          {selected ? (
            <div className="space-y-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-900">{selected.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.authors} · {selected.journal} · {selected.year}
                </p>
              </div>

              <p className="text-sm leading-relaxed text-slate-600">{selected.abstract}</p>

              <dl className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                  <dt className="text-xs text-slate-500">Relevance</dt>
                  <dd className="text-sm font-bold text-slate-800">
                    {selected.relevanceScore.toFixed(1)}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                  <dt className="text-xs text-slate-500">Citations</dt>
                  <dd className="text-sm font-bold text-slate-800">{selected.citationCount}</dd>
                </div>
              </dl>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">DOI (fixture)</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{selected.doi}</p>
              </div>

              <a
                href={`https://doi.org/${selected.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Open DOI
                <span className="sr-only">(opens in a new tab)</span>
              </a>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close details
              </button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Select a paper to see its abstract and metadata.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function medianScore(scores: readonly number[]): string {
  if (scores.length === 0) return '—';
  const sorted = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return median.toFixed(1);
}
