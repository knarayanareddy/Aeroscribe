import { useState } from 'react';
import type { RecheckStatus } from '@aeroscribe/contract';
import {
  isManuscriptPayload,
  isRecheckPayload,
  latestPayload,
  toLiveManuscript,
  toLiveRecheck,
} from '../api/mappers';
import { useActiveRun, useEvidence } from '../state/pipelineContext';

/**
 * The manuscript as the API recorded it.
 *
 * There is no `.tex` download here yet: the server does not produce LaTeX, and
 * generating one in the browser from this payload would create an unversioned
 * document that is not the thing the registry hashes. That is workstream B, and
 * until it lands the page says so rather than offering a button that implies
 * otherwise.
 */
const STATUS_STYLE: Record<RecheckStatus, string> = {
  fresh: 'bg-emerald-50 text-emerald-800',
  stale: 'bg-amber-50 text-amber-800',
  broken: 'bg-red-50 text-red-800',
  mismatch: 'bg-red-50 text-red-800',
  unverified: 'bg-slate-100 text-slate-700',
};

export default function ManuscriptLive() {
  const activeRun = useActiveRun();
  const records = useEvidence();
  const payload = latestPayload(records, 'manuscript', isManuscriptPayload);
  const recheckPayload = latestPayload(records, 'doi-recheck', isRecheckPayload);
  const checks = recheckPayload ? toLiveRecheck(recheckPayload) : null;
  const [openSection, setOpenSection] = useState<string | null>(null);

  if (!activeRun) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Manuscript</h1>
        <p className="mt-2 text-sm text-slate-500">Select a run to see its manuscript.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Manuscript</h1>
        <p
          data-testid="manuscript-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"
        >
          This run has no manuscript record. Stage 5 writes one once the CFD evidence is approved;
          nothing is shown until it exists.
        </p>
      </div>
    );
  }

  const manuscript = toLiveManuscript(payload);
  const totalWords = manuscript.sections.reduce((sum, section) => sum + section.words, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{manuscript.title}</h1>
        <p className="mt-1 text-slate-500">
          {manuscript.journal} · {manuscript.wordCount} words · {manuscript.references.length}{' '}
          references · generated {new Date(manuscript.generatedAt).toLocaleString()}
        </p>
      </div>

      {manuscript.synthetic && (
        <div
          data-testid="manuscript-synthetic-notice"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-amber-900">
            This manuscript reports a synthetic result.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            At least one number came from the deterministic benchmark solver, not from solving the
            governing equations. The review verdict and the stage-8 submission gate both treat it
            that way.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Abstract</h2>
        <p className="text-sm leading-relaxed text-slate-700">{manuscript.abstract}</p>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Sections', value: String(manuscript.sections.length) },
          { label: 'Words (sections)', value: totalWords.toLocaleString() },
          { label: 'Words (recorded)', value: manuscript.wordCount.toLocaleString() },
          { label: 'References', value: String(manuscript.references.length) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</dd>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Sections</h2>
        {manuscript.sections.map((section) => {
          const open = openSection === section.heading;
          return (
            <article key={section.heading} className="rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setOpenSection(open ? null : section.heading)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-slate-800">{section.heading}</span>
                <span className="text-xs text-slate-400">{section.words} words</span>
              </button>
              {open && (
                <p className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
                  {section.body}
                </p>
              )}
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-900">References</h2>
        <ol className="space-y-2 text-sm text-slate-700">
          {manuscript.references.map((reference) => (
            <li key={reference.index} className="flex gap-2">
              <span className="w-6 shrink-0 text-slate-400">[{reference.index}]</span>
              <span>{reference.citation}</span>
            </li>
          ))}
          {manuscript.references.length === 0 && (
            <li className="italic text-slate-400">No references were admitted for this run.</li>
          )}
        </ol>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5"
        data-testid="citation-checks"
      >
        <h2 className="mb-3 text-sm font-bold text-slate-900">Citation checks</h2>
        {checks ? (
          <>
            <p className="text-sm text-slate-700" data-testid="citation-checks-headline">
              {checks.headline}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Checked {new Date(checks.checkedAt).toLocaleString()} ·{' '}
              {checks.offline ? 'offline, no registry reachable' : 'live providers'} · stale after{' '}
              {checks.maxAgeDays} days
            </p>
            <ul className="mt-3 space-y-1 text-xs">
              {checks.results.map((result) => (
                <li key={result.key} className="flex items-start gap-2">
                  <span className="w-14 shrink-0 font-mono text-slate-500">{result.key}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[result.status]}`}
                  >
                    {result.status}
                  </span>
                  <span className="text-slate-600">
                    {result.reason ?? 'resolved to the stored paper'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-600" data-testid="citation-checks-missing">
            Never re-checked in this run: the verification times above are the ones stored when the
            manuscript was written. <code>npm run recheck -- --run …</code> re-resolves every DOI
            and records the result; nothing here is refreshed in the background.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-bold text-slate-900">Source files</h2>
        <p className="mt-1 text-xs text-slate-600">
          Not produced yet. The LaTeX renderer and the PDF compile step are workstream B in{' '}
          <code className="rounded bg-white px-1 py-0.5">docs/ROADMAP.md</code>; until they exist,
          the submission package is a manifest of hashes, and this page does not offer a download
          that would not match the registry.
        </p>
      </section>
    </div>
  );
}
