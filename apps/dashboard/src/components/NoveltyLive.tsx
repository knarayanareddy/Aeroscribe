import { useId, useState } from 'react';
import { isNoveltyPayload, latestPayload, toLiveGaps } from '../api/mappers';
import { useActiveRun, useEvidence } from '../state/pipelineContext';

/**
 * Novelty, as the API actually records it.
 *
 * The server's stage 2 does one measurable thing: it splits the topic into
 * terms, then checks which of them appear in the abstracts of the *verified*
 * references. Terms nobody wrote about are reported as uncovered. There is no
 * novelty score and no competitor risk — those were fixture inventions — so this
 * view shows coverage and refuses to rank.
 */
export default function NoveltyLive() {
  const activeRun = useActiveRun();
  const records = useEvidence();
  const payload = latestPayload(records, 'novelty-report', isNoveltyPayload);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const listId = useId();

  if (!activeRun) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Novelty &amp; gap analysis</h1>
        <p className="mt-2 text-sm text-slate-500">Select a run to see its coverage analysis.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Novelty &amp; gap analysis</h1>
        <p
          data-testid="novelty-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"
        >
          This run has no novelty record. Stage 2 writes one after the literature stage has been
          approved; nothing is shown until it exists.
        </p>
      </div>
    );
  }

  const gaps = toLiveGaps(payload);
  const selected = gaps.find((gap) => gap.term === selectedTerm) ?? null;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Novelty &amp; gap analysis</h1>
        <p className="mt-1 text-slate-500">
          Term coverage over {payload.verifiedReferences} verified reference
          {payload.verifiedReferences === 1 ? '' : 's'} · confidence:{' '}
          <span className="font-medium">{payload.confidence}</span>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs text-slate-600">
          This measures whether the topic&apos;s terms appear in the abstracts that were verified —
          nothing more. No novelty score is computed, because a number like that would need an
          embedding index over the literature graph, which does not exist here.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Uncovered terms', value: String(gaps.length) },
          { label: 'Covered terms', value: String(payload.coveredTerms.length) },
          { label: 'Verified references', value: String(payload.verifiedReferences) },
          {
            label: 'Confidence',
            value: payload.confidence === 'supported' ? 'Supported' : 'Insufficient',
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</dd>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby={listId} className="lg:col-span-1">
          <h2
            id={listId}
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Terms no verified abstract mentions ({gaps.length})
          </h2>
          <ul className="space-y-2">
            {gaps.map((gap) => (
              <li key={gap.term}>
                <button
                  type="button"
                  onClick={() => setSelectedTerm(gap.term)}
                  aria-pressed={gap.term === selectedTerm}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${
                    gap.term === selectedTerm
                      ? 'border-violet-300 bg-violet-50 font-semibold text-violet-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {gap.term}
                </button>
              </li>
            ))}
            {gaps.length === 0 && (
              <li className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                Every topic term appears in at least one verified abstract.
              </li>
            )}
          </ul>

          <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Covered terms ({payload.coveredTerms.length})
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {payload.coveredTerms.map((term) => (
              <li
                key={term}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
              >
                {term}
              </li>
            ))}
            {payload.coveredTerms.length === 0 && (
              <li className="text-xs italic text-slate-500">None.</li>
            )}
          </ul>
        </section>

        <aside className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">
              {selected ? `“${selected.term}”` : 'Select a term'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {selected
                ? 'No admitted reference discusses this term in its abstract. That is the whole finding: it is a prompt for a human to check the literature, not a claim that the topic is novel.'
                : 'The gaps above are terms, not scores. Select one to see what the record says — which is only that it is uncovered.'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-bold text-slate-900">Notes from the stage</h2>
            <ul className="space-y-1 text-xs text-slate-600">
              {payload.notes.length === 0 && (
                <li className="italic text-slate-400">None recorded.</li>
              )}
              {payload.notes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          </div>

          {payload.confidence === 'insufficient-evidence' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Insufficient evidence</p>
              <p className="mt-1 text-xs text-amber-800">
                Too few references were verified for term coverage to mean anything. Treat the list
                as a to-do, not as a result.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
