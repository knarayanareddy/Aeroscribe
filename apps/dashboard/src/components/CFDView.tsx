import { formatMeasuredValue, truncateHash } from '@aeroscribe/pipeline';
import { useState } from 'react';
import { mockCFDResults } from '../data/mockData';

type Tab = 'results' | 'convergence' | 'registry';

/** Illustrative solver history — not the output of a real CFD run. */
const convergenceData = [
  { iter: 100, residual: 1.2e-2, lift: 0.44, drag: 0.082 },
  { iter: 200, residual: 4.1e-3, lift: 0.47, drag: 0.079 },
  { iter: 400, residual: 8.3e-4, lift: 0.482, drag: 0.076 },
  { iter: 600, residual: 2.1e-4, lift: 0.489, drag: 0.0745 },
  { iter: 800, residual: 6.4e-5, lift: 0.492, drag: 0.0738 },
  { iter: 1000, residual: 1.9e-5, lift: 0.494, drag: 0.0734 },
  { iter: 1200, residual: 5.8e-6, lift: 0.4952, drag: 0.0731 },
  { iter: 1400, residual: 1.7e-6, lift: 0.4961, drag: 0.0729 },
  { iter: 1600, residual: 5.1e-7, lift: 0.4968, drag: 0.0728 },
  { iter: 1800, residual: 1.5e-7, lift: 0.4972, drag: 0.0727 },
  { iter: 2000, residual: 4.4e-8, lift: 0.4975, drag: 0.0726 },
  { iter: 2400, residual: 1.2e-8, lift: 0.4977, drag: 0.0726 },
];

const targetResidual = 1e-6;

const gridStudy = [
  { level: 'Coarse (L1)', cells: '1.2M', waveSpeed: '1798', isp: '4201', gci: '3.84%' },
  { level: 'Medium (L2)', cells: '4.9M', waveSpeed: '1831', isp: '4278', gci: '1.21%' },
  { level: 'Fine (L3)', cells: '12.4M', waveSpeed: '1842', isp: '4312', gci: '0.38%' },
  { level: 'Extra fine (L4)', cells: '49.6M', waveSpeed: '1845', isp: '4319', gci: '—' },
];

const chartWidth = 360;
const chartHeight = 80;

/** Map residuals onto the sparkline; returns null when the series is degenerate. */
function buildChart() {
  const values = convergenceData.map((point) => -Math.log10(point.residual));
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);

  if (!Number.isFinite(maxValue) || !Number.isFinite(minValue) || maxValue === minValue) {
    return null;
  }

  const toY = (logged: number) =>
    chartHeight - ((logged - minValue) / (maxValue - minValue)) * (chartHeight - 10) - 5;

  return {
    points: values
      .map((value, index) => `${(index / (values.length - 1)) * chartWidth},${toY(value)}`)
      .join(' '),
    targetY: toY(-Math.log10(targetResidual)),
  };
}

function convergedAt() {
  return convergenceData.find((point) => point.residual <= targetResidual);
}

export default function CFDView() {
  const [activeTab, setActiveTab] = useState<Tab>('results');

  const chart = buildChart();
  const converged = convergedAt();

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'results', label: 'Verified results' },
    { id: 'convergence', label: 'Convergence' },
    { id: 'registry', label: 'Registry' },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Evidence generation — CFD</h1>
        <p className="mt-1 text-slate-500">
          Values are rendered as value ± uncertainty (confidence, method), per RULE-031
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        <p className="flex-1 text-sm text-amber-900">
          <strong className="font-semibold">Illustrative fixtures.</strong> These numbers are demo
          data shipped with the repository; no solver is running and no registry is connected.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Evidence sections"
        className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`cfd-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`cfd-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'results' && (
        <div
          role="tabpanel"
          id="cfd-panel-results"
          aria-labelledby="cfd-tab-results"
          className="space-y-4"
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mockCFDResults.slice(0, 3).map((result) => (
              <li
                key={result.id}
                className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"
              >
                <p className="mb-1 text-xs font-medium text-slate-500">{result.name}</p>
                <p className="font-mono text-2xl font-bold text-slate-900">
                  {formatMeasuredValue(result.value, result.uncertainty)}
                </p>
                <p className="text-sm text-slate-500">
                  {result.unit === '—' ? 'dimensionless' : result.unit}
                </p>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">
                    {result.confidence}% CI · {result.method}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400"
                      aria-hidden="true"
                    />
                    Checksum {truncateHash(result.sha256, 8, 4)} (fixture)
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold text-slate-800">
                All verified CFD results — fixture set
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Formatting rule: value ± uncertainty (confidence %, method)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left font-medium">
                      Quantity
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Value ± σ
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Unit
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      CI
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Method
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      SHA-256
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mockCFDResults.map((result) => (
                    <tr key={result.id} className="hover:bg-slate-50">
                      <td className="min-w-[12rem] px-5 py-3 font-medium text-slate-800">
                        {result.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-slate-700">
                        {formatMeasuredValue(result.value, result.uncertainty)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {result.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{result.confidence}%</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{result.method}</td>
                      <td className="px-4 py-3">
                        <code title={result.sha256} className="font-mono text-xs text-slate-400">
                          {truncateHash(result.sha256)}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'convergence' && (
        <div
          role="tabpanel"
          id="cfd-panel-convergence"
          aria-labelledby="cfd-tab-convergence"
          className="space-y-4"
        >
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-800">Solver residual convergence</h2>
            <p className="mb-4 text-xs text-slate-500">
              L² norm of momentum residuals · target &lt; {targetResidual.toExponential(0)}
            </p>

            {chart ? (
              <div className="relative h-[120px] rounded-xl bg-slate-900 p-4">
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Residual history decreasing from 1.2e-2 to 1.2e-8 over 2400 iterations"
                >
                  <polyline
                    points={chart.points}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1={0}
                    y1={chart.targetY}
                    x2={chartWidth}
                    y2={chart.targetY}
                    stroke="#10b981"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                </svg>
                <p className="absolute bottom-3 right-3 text-xs font-semibold text-emerald-400">
                  {converged
                    ? `✓ Below target from iteration ${converged.iter}`
                    : 'Not yet converged'}
                </p>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                Residual history is flat — nothing to plot.
              </p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: 'Iterations',
                  value: convergenceData.at(-1)?.iter.toLocaleString('en-US') ?? '—',
                },
                {
                  label: 'Final residual',
                  value: convergenceData.at(-1)?.residual.toExponential(1) ?? '—',
                },
                {
                  label: 'Lift coefficient',
                  value: convergenceData.at(-1)?.lift.toFixed(4) ?? '—',
                },
                {
                  label: 'Drag coefficient',
                  value: convergenceData.at(-1)?.drag.toFixed(4) ?? '—',
                },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-100 p-3">
                  <dt className="text-xs text-slate-500">{item.label}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold text-slate-800">Grid convergence study</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Richardson extrapolation · GCI &lt; 1% required before a value may enter a
                manuscript (GATE-4A criterion)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left font-medium">
                      Grid level
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Cells
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Wave speed (m/s)
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Isp (s)
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      GCI
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {gridStudy.map((row) => (
                    <tr key={row.level} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{row.level}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{row.cells}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {row.waveSpeed}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{row.isp}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.gci}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'registry' && (
        <div
          role="tabpanel"
          id="cfd-panel-registry"
          aria-labelledby="cfd-tab-registry"
          className="space-y-4"
        >
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-800">Evidence registry</h2>
            <p className="mt-1 text-sm text-slate-600">
              The registry is specified as an append-only ledger: each record stores the value, its
              uncertainty, the method and a SHA-256 checksum of the artefact that produced it
              (RULE-043). It is not implemented yet — the checksums shown in this prototype come
              from the fixture file.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              See <code className="rounded bg-slate-100 px-1 py-0.5">specs/integrity-rules.md</code>{' '}
              for the full rule set and{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">
                docs/IMPLEMENTATION_STATUS.md
              </code>{' '}
              for what is live.
            </p>
          </div>

          <ul className="space-y-2">
            {mockCFDResults.map((result) => (
              <li
                key={result.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{result.name}</p>
                  <p className="font-mono text-xs text-slate-400">{result.sha256}</p>
                </div>
                <p className="font-mono text-sm text-slate-700">
                  {formatMeasuredValue(result.value, result.uncertainty)} {result.unit}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
