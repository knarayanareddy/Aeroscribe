import { useState } from 'react';
import { usePipeline } from '../state/pipelineContext';

/**
 * What this instance can actually do, as the server reports it.
 *
 * Every value here comes from `GET /api/v1/capabilities` or the audit trail —
 * nothing is a placeholder. A capability the server does not have is reported
 * as `false`/`not configured`, which is the whole reason the endpoint exists.
 */
export default function SettingsLive() {
  const { capabilities, audit, sourceLabel } = usePipeline();
  const [showAudit, setShowAudit] = useState(false);

  if (!capabilities) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-500">
          The server did not return capabilities. Nothing about this instance can be reported.
        </p>
      </div>
    );
  }

  const rows: Array<{ label: string; value: string; ok: boolean; note?: string }> = [
    {
      label: 'Literature providers',
      value: capabilities.literature.mode === 'live' ? 'Live' : 'Offline corpus',
      ok: capabilities.literature.mode === 'live',
      note:
        capabilities.literature.mode === 'live'
          ? `Crossref ${yesNo(capabilities.literature.crossref)} · arXiv ${yesNo(capabilities.literature.arxiv)} · Semantic Scholar ${yesNo(capabilities.literature.semanticScholar)}`
          : 'Offline: the bundled corpus has no DOIs, so no reference from it can be cited.',
    },
    {
      label: 'SU2 CFD solver',
      value: capabilities.cfd.su2.available ? 'Available' : 'Not configured',
      ok: capabilities.cfd.su2.available,
      note: capabilities.cfd.su2.binary
        ? `SU2_CFD_BINARY = ${capabilities.cfd.su2.binary}`
        : 'SU2_CFD_BINARY is unset. Stage 4 will use the synthetic benchmark and the run will be labelled synthetic.',
    },
    {
      label: 'LaTeX toolchain',
      value: capabilities.latex.available ? 'Available' : 'Not configured',
      ok: capabilities.latex.available,
      note: capabilities.latex.configured
        ? `LATEX_BINARY = ${capabilities.latex.binary ?? ''}${capabilities.latex.version ? ` · ${capabilities.latex.version}` : ' · no version reported'}`
        : 'LATEX_BINARY is unset. Stage 8 still writes the .tex, records typeset="source-only" and blocks submission with the reason.',
    },
    {
      label: 'Synthetic benchmark',
      value: capabilities.cfd.synthetic ? 'Available (labelled)' : 'Unavailable',
      ok: capabilities.cfd.synthetic,
      note: 'Its results are always marked synthetic in the payload and in this UI.',
    },
    {
      label: 'Evidence registry',
      value: `${capabilities.registry.algorithm} hash chain`,
      ok: true,
      note: capabilities.registry.path,
    },
    {
      label: 'API authentication',
      value: capabilities.auth.required ? 'API key required' : 'Disabled',
      ok: capabilities.auth.required,
      note: capabilities.auth.required
        ? 'Requests must carry Authorization: Bearer <key>.'
        : 'AEROSCRIBE_API_KEY is unset. Do not expose this instance to the internet.',
    },
    {
      label: 'Storage adapter',
      value: capabilities.storage.backend === 'postgres' ? 'Postgres' : 'Filesystem',
      ok: true,
      // Naming the backend is the point: a reader must be able to tell whether
      // this instance can run beside a second one before adding a replica.
      note:
        capabilities.storage.backend === 'postgres'
          ? `AEROSCRIBE_STORE = postgres · ${capabilities.storage.database ?? 'database'}`
          : 'AEROSCRIBE_STORE = filesystem · single writer',
    },
    ...(capabilities.storage.backend === 'filesystem'
      ? [
          {
            label: 'Data directory',
            value: 'On disk',
            ok: true,
            note: `runs: ${capabilities.storage.runsDir} · audit: ${capabilities.storage.auditPath}`,
          },
        ]
      : []),

    {
      label: 'Language model',
      value: 'Not used',
      ok: true,
      note: 'Every stage handler is deterministic. No model is called, so there are no tokens to bill.',
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">
          Reported by the server at {sourceLabel} · read-only, and no secret is ever sent to the
          browser
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3 text-left font-medium">
                Capability
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                This instance
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">
                  {row.label}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {row.value}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-800">Audit trail</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Append-only. Every gate decision and stage run is written here before the response is
              returned.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAudit((open) => !open)}
            aria-expanded={showAudit}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showAudit ? 'Hide' : 'Show'} entries
          </button>
        </div>

        {showAudit && (
          <div className="mt-3 overflow-x-auto">
            {audit ? (
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 text-left font-medium">When</th>
                    <th className="py-1 pr-3 text-left font-medium">Action</th>
                    <th className="py-1 pr-3 text-left font-medium">Actor</th>
                    <th className="py-1 text-left font-medium">Run</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {audit.entries
                    .slice(-25)
                    .reverse()
                    .map((entry, index) => (
                      <tr key={`${entry.at}-${index}`} className="border-t border-slate-100">
                        <td className="py-1 pr-3">{new Date(entry.at).toLocaleString()}</td>
                        <td className="py-1 pr-3 font-mono">{entry.action}</td>
                        <td className="py-1 pr-3">{entry.actor}</td>
                        <td className="py-1 font-mono">{entry.runId ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">No audit trail was returned.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function yesNo(value: boolean): string {
  return value ? 'on' : 'off';
}
