import { useState } from 'react';
import { mockContradictions, mockResearchGaps } from '../data/mockData';
import { usePipeline } from '../state/pipelineContext';
import NoveltyLive from './NoveltyLive';

const riskStyles: Record<string, string> = {
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  high: 'border-red-200 bg-red-50 text-red-700',
};

const sortedGaps = [...mockResearchGaps].sort((a, b) => b.noveltyScore - a.noveltyScore);

export default function NoveltyView() {
  const { mode } = usePipeline();
  const [selectedGapId, setSelectedGapId] = useState(sortedGaps[0]?.id ?? '');
  const selectedGap = sortedGaps.find((gap) => gap.id === selectedGapId) ?? sortedGaps[0];

  // Fixture-only view: in live mode it refuses rather than showing invented
  // novelty scores next to a run that has none.
  if (mode === 'live') return <NoveltyLive />;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Novelty &amp; gap analysis</h1>
        <p className="mt-1 text-slate-500">
          Gap matrix scores and contradiction detection · illustrative fixture data
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-900">
          These gap scores are sample values. Real novelty scoring requires the literature graph and
          an embedding index, neither of which is implemented.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby="gaps-heading" className="lg:col-span-1">
          <h2
            id="gaps-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Candidate gaps ({sortedGaps.length})
          </h2>
          <ul className="space-y-2">
            {sortedGaps.map((gap) => {
              const isSelected = gap.id === selectedGap?.id;
              return (
                <li key={gap.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGapId(gap.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-violet-300 bg-violet-50'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">{gap.id}</span>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                        {gap.noveltyScore.toFixed(1)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-slate-800">
                      {gap.phenomena}
                    </p>
                    <p
                      className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs ${riskStyles[gap.competitorRisk]}`}
                    >
                      risk: {gap.competitorRisk}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="gap-detail-heading" className="lg:col-span-2">
          <h2
            id="gap-detail-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Gap detail
          </h2>
          {selectedGap ? (
            <div className="space-y-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedGap.phenomena}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Missing methodology: {selectedGap.missingMethodology}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Novelty score</dt>
                  <dd className="text-lg font-bold text-violet-700">
                    {selectedGap.noveltyScore.toFixed(1)}
                  </dd>
                </div>
                <div className={`rounded-lg border p-3 ${riskStyles[selectedGap.competitorRisk]}`}>
                  <dt className="text-xs opacity-80">Competitor risk</dt>
                  <dd className="text-lg font-bold capitalize">{selectedGap.competitorRisk}</dd>
                </div>
              </dl>

              <div className="rounded-lg border border-violet-100 bg-violet-50 p-3">
                <p className="mb-1 text-xs font-semibold text-violet-700">Recommendation</p>
                <p className="text-sm text-violet-900">{selectedGap.recommendation}</p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No gaps in the fixture set.
            </p>
          )}
        </section>
      </div>

      <section
        aria-labelledby="contradictions-heading"
        className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 id="contradictions-heading" className="font-semibold text-slate-800">
            Contradiction detection
          </h2>
        </div>
        <ul className="divide-y divide-slate-50">
          {mockContradictions.map((contradiction) => (
            <li
              key={contradiction.id}
              className="grid grid-cols-1 items-center gap-3 p-5 md:grid-cols-5"
            >
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 md:col-span-2">
                <p className="mb-1 text-xs font-bold text-red-700">{contradiction.paperA}</p>
                <p className="text-xs text-red-900">&ldquo;{contradiction.claimA}&rdquo;</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-lg" aria-hidden="true">
                  ⚡
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {Math.round(contradiction.score * 100)}%
                </span>
                <span className="text-[10px] text-slate-400">conflict</span>
                <span className="mt-1 text-center text-[10px] text-slate-500">
                  {contradiction.topic}
                </span>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 md:col-span-2">
                <p className="mb-1 text-xs font-bold text-amber-700">{contradiction.paperB}</p>
                <p className="text-xs text-amber-900">&ldquo;{contradiction.claimB}&rdquo;</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
