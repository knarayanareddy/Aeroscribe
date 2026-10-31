import { useId, useState } from 'react';
import {
  formatReferenceLine,
  isLiteraturePayload,
  latestPayload,
  toLiveReferences,
  type LiveReference,
} from '../api/mappers';
import { useActiveRun, useEvidence } from '../state/pipelineContext';

/**
 * The literature view, reading the run's actual `literature-search` record.
 *
 * What it shows is what was verified: every row is a reference the server
 * resolved against a DOI registry, with the timestamp of that resolution. Rows
 * carry no relevance score and no tags, because the API records neither — the
 * rank column is the search rank, which is a fact.
 */
export default function LiteratureLive() {
  const activeRun = useActiveRun();
  const records = useEvidence();
  const payload = latestPayload(records, 'literature-search', isLiteraturePayload);

  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const searchId = useId();

  if (!activeRun) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Literature archaeology</h1>
        <p className="mt-2 text-sm text-slate-500">Select a run to see its references.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Literature archaeology</h1>
        <p
          data-testid="literature-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"
        >
          This run has no literature record yet. Stage 1 writes one when it runs; nothing is shown
          until it exists.
        </p>
      </div>
    );
  }

  const references = toLiveReferences(payload);
  const term = search.trim().toLowerCase();
  const filtered =
    term.length === 0
      ? references
      : references.filter((reference) =>
          [reference.title, reference.doi, reference.venue, ...reference.authors]
            .filter((value): value is string => typeof value === 'string')
            .some((value) => value.toLowerCase().includes(term)),
        );
  const selected = filtered.find((reference) => reference.key === selectedKey) ?? null;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Literature archaeology</h1>
        <p className="mt-1 text-slate-500">
          {payload.papersVerified} DOI-verified of {payload.papersFound} hits ·{' '}
          {payload.offline ? 'offline corpus (no DOIs, nothing citable)' : 'live providers'} ·
          searched {new Date(payload.searchedAt).toLocaleString()}
        </p>
      </div>

      {payload.offline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-900">
            This run used the offline corpus. Its entries carry no DOIs by design, so nothing in it
            can be cited — that is why the reference list below is empty.
          </p>
        </div>
      )}

      {payload.providerErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-900">Providers that failed</p>
          <ul className="mt-1 space-y-0.5 text-xs text-red-800">
            {payload.providerErrors.map((error) => (
              <li key={error.provider}>
                <code>{error.provider}</code> — {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.rejected.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            {payload.rejected.length} hits rejected (not citable)
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {payload.rejected.map((entry) => (
              <li key={`${entry.title}-${entry.reason}`}>
                <span className="font-medium">{entry.title}</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'References', value: String(references.length) },
          { label: 'Hits from providers', value: String(payload.papersFound) },
          { label: 'Rejected', value: String(payload.rejected.length) },
          { label: 'Provider errors', value: String(payload.providerErrors.length) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-500">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</dd>
          </div>
        ))}
      </div>

      <div>
        <label htmlFor={searchId} className="mb-1 block text-sm font-medium text-slate-700">
          Filter references
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Title, author, venue or DOI"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ul className="space-y-2 xl:col-span-2">
          {filtered.map((reference) => (
            <li key={reference.key}>
              <button
                type="button"
                onClick={() => setSelectedKey(reference.key)}
                aria-pressed={reference.key === selectedKey}
                className={`w-full rounded-xl border p-4 text-left ${
                  reference.key === selectedKey
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {reference.title ?? 'Untitled (title not recorded)'}
                  </p>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {reference.key}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatReferenceLine(reference)}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {reference.verifiedAt
                    ? `DOI resolved ${new Date(reference.verifiedAt).toLocaleString()}${reference.verifiedBy ? ` via ${reference.verifiedBy}` : ''}`
                    : 'No DOI resolution recorded'}
                  {reference.rank !== null ? ` · search rank ${reference.rank}` : ''}
                </p>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
              {references.length === 0
                ? 'No references were admitted for this run.'
                : 'No reference matches that filter.'}
            </li>
          )}
        </ul>

        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          {selected ? (
            <ReferenceDetail reference={selected} />
          ) : (
            <p className="text-sm text-slate-500">
              Select a reference to see the fields it carries.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

const fields: Array<{ key: keyof LiveReference; label: string }> = [
  { key: 'authors', label: 'Authors' },
  { key: 'year', label: 'Year' },
  { key: 'venue', label: 'Venue' },
  { key: 'volume', label: 'Volume' },
  { key: 'pages', label: 'Pages' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'doi', label: 'DOI' },
  { key: 'citationCount', label: 'Citations' },
];

function ReferenceDetail({ reference }: { reference: LiveReference }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-slate-900">
        {reference.title ?? 'Untitled (title not recorded)'}
      </h2>
      <dl className="space-y-1.5 text-xs">
        {fields.map(({ key, label }) => {
          const value = reference[key];
          const shown = Array.isArray(value)
            ? value.length > 0
              ? value.join(', ')
              : null
            : typeof value === 'number'
              ? String(value)
              : (value ?? null);
          return (
            <div key={key} className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
              <dd className={shown === null ? 'italic text-slate-400' : 'text-slate-800'}>
                {shown ?? 'not recorded'}
              </dd>
            </div>
          );
        })}
      </dl>
      {reference.abstract && (
        <p className="border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600">
          {reference.abstract}
        </p>
      )}
      {reference.url && (
        <a
          href={reference.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          Open record ↗
        </a>
      )}
    </div>
  );
}
