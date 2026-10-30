import { STAGE_COUNT } from '@aeroscribe/pipeline';
import { useState } from 'react';
import { integrityRules, journalProfiles } from '../data/mockData';

type Tab = 'environment' | 'journals' | 'agents' | 'integrity';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'environment', label: 'Environment' },
  { id: 'journals', label: 'Journal profiles' },
  { id: 'agents', label: 'Agent config' },
  { id: 'integrity', label: 'Integrity rules' },
];

/**
 * Settings are read-only in the prototype.
 *
 * The previous version rendered password inputs for API keys with no handler
 * behind them. Prompting an operator to paste a secret into a client-side
 * component that cannot store it safely is worse than showing nothing, so this
 * view reports configuration state instead of collecting credentials.
 */
const environmentVariables = [
  {
    name: 'ANTHROPIC_API_KEY',
    purpose: 'Agent runtime (orchestrator, writers, reviewers)',
    status: 'Not configured',
  },
  {
    name: 'SEMANTIC_SCHOLAR_API_KEY',
    purpose: 'Literature harvesting and reranking',
    status: 'Not configured',
  },
  {
    name: 'DATABASE_URL',
    purpose: 'Pipeline state and evidence registry',
    status: 'Not connected',
  },
  {
    name: 'OBJECT_STORAGE_URL',
    purpose: 'CFD artefacts and manuscript bundles',
    status: 'Not connected',
  },
];

const modelRouting = [
  { role: 'Orchestration', model: 'claude-sonnet-4-5', stages: 'Stages 0–8' },
  { role: 'Writing and review', model: 'claude-opus-4-5', stages: 'Stages 5–6' },
  { role: 'Classification and reranking', model: 'claude-haiku-3-5', stages: 'Stages 1–2' },
];

const agentTimeouts = [
  { agent: 'PipelineOrchestrator', timeout: '72 hours' },
  { agent: 'LiteratureHarvestAgent', timeout: '4 hours' },
  { agent: 'CFDSolverAgent', timeout: '15 min/run' },
  { agent: 'SectionWriterAgent', timeout: '2 hours' },
  { agent: 'ReviewerA/B/C/DAgent', timeout: '1 hour each' },
];

const contextBudget = [
  { stage: 'Stage 1 (Literature)', maxMcps: 15 },
  { stage: 'Stage 4 (CFD evidence)', maxMcps: 8 },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<Tab>('environment');

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">
          Read-only configuration reference · secrets belong in the environment, never in the
          browser
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
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

      {activeTab === 'environment' && (
        <div
          role="tabpanel"
          id="settings-panel-environment"
          aria-labelledby="settings-tab-environment"
          className="space-y-5"
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">No backend is connected</p>
            <p className="mt-1 text-xs text-amber-800">
              This prototype renders fixture data. Credentials are read by the API/worker processes
              from the environment; the dashboard never receives or stores them (RULE-040).
            </p>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold text-slate-800">Environment variables</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Required by the specified backend — documented in specs/architecture.md
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left font-medium">
                      Variable
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Purpose
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {environmentVariables.map((variable) => (
                    <tr key={variable.name}>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-700">
                        {variable.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{variable.purpose}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {variable.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-800">Model routing</h2>
            <p className="mb-4 text-xs text-slate-500">
              Fixed profiles in the prototype; will move behind the API.
            </p>
            <ul className="space-y-2">
              {modelRouting.map((route) => (
                <li
                  key={route.role}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{route.role}</p>
                    <p className="text-xs text-slate-500">{route.stages}</p>
                  </div>
                  <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                    {route.model}
                  </code>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-800">Infrastructure</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: 'Database', value: 'PostgreSQL 16 (specified)' },
                { label: 'Cache / queue', value: 'Redis 7 + BullMQ (specified)' },
                { label: 'Object storage', value: 'S3-compatible (specified)' },
                { label: 'CFD solver', value: 'OpenFOAM / SU2 (specified)' },
              ].map((item) => (
                <li key={item.label} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">{item.label}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      not connected
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{item.value}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {activeTab === 'journals' && (
        <div
          role="tabpanel"
          id="settings-panel-journals"
          aria-labelledby="settings-tab-journals"
          className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-800">Journal profile database</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Scope, formatting requirements and acceptance rates used for calibration
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 text-left font-medium">
                    Journal
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Publisher
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Impact factor
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Accept rate
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Review time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {journalProfiles.map((journal) => (
                  <tr key={journal.id} className="hover:bg-slate-50">
                    <td className="min-w-[14rem] px-5 py-3 font-medium text-slate-800">
                      {journal.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {journal.publisher}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {journal.impactFactor}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {journal.acceptanceRate}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {journal.reviewWeeks} wks
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Impact factors and acceptance rates are illustrative values stored with the fixture
            data; verify them against the publisher before relying on them.
          </p>
        </div>
      )}

      {activeTab === 'agents' && (
        <div
          role="tabpanel"
          id="settings-panel-agents"
          aria-labelledby="settings-tab-agents"
          className="space-y-4"
        >
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-800">Context budget (RULE-024)</h2>
            <p className="mb-4 text-xs text-slate-500">Maximum MCP servers active per stage.</p>
            <ul className="space-y-2">
              {contextBudget.map((budget) => (
                <li
                  key={budget.stage}
                  className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0"
                >
                  <span className="text-sm text-slate-700">{budget.stage}</span>
                  <span className="text-sm font-semibold text-blue-600">{budget.maxMcps}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-800">Agent timeouts</h2>
            <ul className="space-y-2.5">
              {agentTimeouts.map((agent) => (
                <li
                  key={agent.agent}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 py-2 last:border-0"
                >
                  <span className="font-mono text-sm text-slate-700">{agent.agent}</span>
                  <span className="text-sm font-medium text-blue-600">{agent.timeout}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
            {STAGE_COUNT} stages run sequentially; the orchestrator persists state between gates so
            a run can be paused for days without losing context.
          </p>
        </div>
      )}

      {activeTab === 'integrity' && (
        <div
          role="tabpanel"
          id="settings-panel-integrity"
          aria-labelledby="settings-tab-integrity"
          className="space-y-4"
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="mb-1 font-bold text-red-800">Article I — absolute prohibitions</p>
            <p className="text-xs text-red-700">
              Rules marked “UI” are visible in this prototype. Rules marked “specified” exist in
              specs/integrity-rules.md and will be enforced by the backend; they are not enforced by
              code today.
            </p>
          </div>

          <ul className="space-y-3">
            {integrityRules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <span className="shrink-0 rounded bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-500">
                  {rule.id}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{rule.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{rule.description}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    rule.enforcement === 'ui'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {rule.enforcement === 'ui' ? 'Visible in UI' : 'Specified only'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
