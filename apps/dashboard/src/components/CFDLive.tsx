import { formatNumber } from '@aeroscribe/pipeline';
import { isCfdPayload, latestPayload, toLiveCfd } from '../api/mappers';
import { useActiveRun, useEvidence } from '../state/pipelineContext';

/**
 * Computational evidence, read from the run's `cfd-run` record.
 *
 * Everything on this screen is a field of that record — the value, its GCI
 * uncertainty, the mesh table and the artefact checksums. There is no
 * convergence plot, because the API does not record solver residuals; a chart
 * of numbers nobody measured is exactly the kind of decoration this project
 * exists to avoid.
 */
export default function CFDLive() {
  const activeRun = useActiveRun();
  const records = useEvidence();
  const payload = latestPayload(records, 'cfd-run', isCfdPayload);

  if (!activeRun) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Computational evidence</h1>
        <p className="mt-2 text-sm text-slate-500">Select a run to see its solver output.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Computational evidence</h1>
        <p
          data-testid="cfd-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"
        >
          This run has no `cfd-run` record. Stage 4 writes one only when a solver actually ran; if
          the solver is unavailable the stage is blocked and records the blocker instead.
        </p>
      </div>
    );
  }

  const cfd = toLiveCfd(payload);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Computational evidence</h1>
        <p className="mt-1 text-slate-500">
          {cfd.quantity} · computed {new Date(cfd.computedAt).toLocaleString()} · solver{' '}
          <span className={cfd.solver === 'synthetic' ? 'font-semibold text-amber-700' : ''}>
            {cfd.solver}
          </span>
        </p>
      </div>

      {cfd.solver === 'synthetic' && (
        <div
          data-testid="cfd-synthetic-notice"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-amber-900">
            Synthetic result — not a simulation.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {cfd.disclaimer ??
              'These numbers come from the deterministic benchmark solver, not from solving the governing equations for this case.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {cfd.quantity}
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">
            {formatNumber(cfd.value)} <span className="text-base font-medium">{cfd.unit}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ± {formatNumber(cfd.uncertainty)}
            {cfd.gci?.fineGciPercent !== null && cfd.gci
              ? ` (GCI ${formatNumber(cfd.gci.fineGciPercent)}%)`
              : ''}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Grid convergence
          </p>
          {cfd.gci ? (
            <>
              <p className="mt-1 text-3xl font-black text-slate-900">
                {cfd.gci.valid ? 'Valid' : 'Not valid'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {cfd.gci.valid
                  ? `Observed order ${formatNumber(cfd.gci.apparentOrder)}`
                  : (cfd.gci.reason ?? 'The mesh set does not support a GCI estimate.')}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No GCI study recorded for this run.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Method</p>
          <p className="mt-1 text-sm text-slate-800">{cfd.method}</p>
        </div>
      </div>

      {cfd.gci && cfd.gci.levels.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">Mesh levels</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 font-medium">Level</th>
                <th className="py-1 font-medium">Cells</th>
                <th className="py-1 font-medium">{cfd.quantity}</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {cfd.gci.levels.map((level) => (
                <tr key={level.level} className="border-t border-slate-100">
                  <td className="py-1.5">{level.level}</td>
                  <td className="py-1.5">{level.cells.toLocaleString()}</td>
                  <td className="py-1.5">{formatNumber(level.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-900">Records</h2>
        <ul className="space-y-1 text-xs text-slate-600">
          {cfd.notes.length === 0 && <li className="italic text-slate-400">No notes recorded.</li>}
          {cfd.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Artefacts (SHA-256)
        </h3>
        <ul className="space-y-1 text-xs">
          {cfd.artefacts.length === 0 && (
            <li className="italic text-slate-400">No artefacts recorded.</li>
          )}
          {cfd.artefacts.map((artefact) => (
            <li key={artefact.name} className="flex flex-wrap gap-2">
              <span className="font-medium text-slate-800">{artefact.name}</span>
              <code className="break-all text-slate-500">{artefact.sha256}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
