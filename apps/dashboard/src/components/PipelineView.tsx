import { STAGE_COUNT, formatRelativeTime, runProgress, type StageInfo } from '@aeroscribe/pipeline';
import { useId, useState } from 'react';
import { journalProfiles, mockAgentLogs } from '../data/mockData';
import { usePipeline } from '../state/pipelineContext';
import type { View } from './Sidebar';

interface PipelineViewProps {
  onNavigate: (view: View, runId?: string) => void;
}

const stageColors: Record<StageInfo['status'], string> = {
  completed: 'bg-emerald-500 border-emerald-500 text-white',
  running: 'bg-blue-500 border-blue-500 text-white',
  gate_pending: 'bg-orange-400 border-orange-400 text-white',
  pending: 'bg-white border-slate-300 text-slate-400',
  failed: 'bg-red-500 border-red-500 text-white',
  skipped: 'bg-slate-200 border-slate-300 text-slate-500',
};

const stageLineColors: Record<StageInfo['status'], string> = {
  completed: 'bg-emerald-400',
  running: 'bg-blue-400',
  gate_pending: 'bg-orange-400',
  pending: 'bg-slate-200',
  failed: 'bg-red-400',
  skipped: 'bg-slate-300',
};

const runStatusDot: Record<string, string> = {
  running: 'bg-blue-500 motion-safe:animate-pulse',
  gate_pending: 'bg-orange-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  idle: 'bg-slate-400',
};

function StageSummary({ stage }: { stage: StageInfo }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${stageColors[stage.status]}`}
        aria-hidden="true"
      >
        {stage.status === 'completed' ? '✓' : stage.status === 'running' ? '◉' : stage.id}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{stage.name}</span>
          {stage.status === 'running' && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              Running
            </span>
          )}
          {stage.status === 'gate_pending' && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
              ⏸ Gate: {stage.gateId ?? 'pending'}
            </span>
          )}
          {(stage.revisionCount ?? 0) > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              revision {stage.revisionCount}
            </span>
          )}
          {stage.status === 'completed' && stage.gateApproved && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
              approved
            </span>
          )}
        </div>
        {stage.agentsActive.length > 0 && (
          <p className="mt-0.5 text-xs text-slate-400">{stage.agentsActive.join(', ')}</p>
        )}
      </div>
      {stage.duration !== null && stage.duration !== undefined && (
        <span className="shrink-0 text-xs text-slate-400">{stage.duration}m</span>
      )}
    </div>
  );
}

export default function PipelineView({ onNavigate }: PipelineViewProps) {
  const {
    runs,
    activeRun,
    createRun,
    advance,
    approveGate,
    requestRevision,
    selectRun,
    busy,
    mode,
    error,
    status,
  } = usePipeline();

  const [showNewRun, setShowNewRun] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newJournal, setNewJournal] = useState(journalProfiles[0]?.name ?? 'AIAA Journal');
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<number | null>(
    activeRun?.currentStage ?? null,
  );

  const topicId = useId();
  const journalId = useId();

  const runLogs = activeRun ? mockAgentLogs.filter((log) => log.runId === activeRun.id) : [];

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const topic = newTopic.trim();

    if (topic.length < 8) {
      setFormError('Describe the research topic in at least 8 characters.');
      return;
    }

    try {
      await createRun({ topic, journal: newJournal });
      setNewTopic('');
      setFormError(null);
      setShowNewRun(false);
      setExpandedStage(0);
    } catch (caught) {
      // The server's sentence, not a rewrite of it.
      setFormError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline manager</h1>
          <p className="mt-1 text-slate-500">
            {STAGE_COUNT} stages, each ending at a human decision gate
            {mode === 'fixtures' ? ' · illustrative data' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'live' && activeRun && activeRun.status !== 'gate_pending' && (
            <button
              type="button"
              onClick={() => void advance(activeRun.id)}
              disabled={busy || activeRun.status === 'completed'}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? 'Running stage…' : 'Run next stage'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewRun((open) => !open)}
            aria-expanded={showNewRun}
            aria-controls="new-run-form"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 4v16m8-8H4" strokeLinecap="round" />
            </svg>
            New pipeline run
          </button>
        </div>
      </div>

      {status === 'error' && error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {showNewRun && (
        <form
          id="new-run-form"
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold text-slate-800">Launch a new pipeline run</h2>

          <div>
            <label htmlFor={topicId} className="mb-1 block text-sm font-medium text-slate-700">
              Research topic
            </label>
            <textarea
              id={topicId}
              value={newTopic}
              onChange={(event) => setNewTopic(event.target.value)}
              rows={2}
              required
              minLength={8}
              aria-describedby={formError ? `${topicId}-error` : undefined}
              placeholder="e.g. Adaptive wing morphing for transonic drag reduction using SMA actuators"
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor={journalId} className="mb-1 block text-sm font-medium text-slate-700">
              Target journal
            </label>
            <select
              id={journalId}
              value={newJournal}
              onChange={(event) => setNewJournal(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {journalProfiles.map((journal) => (
                <option key={journal.id} value={journal.name}>
                  {journal.name} (IF {journal.impactFactor})
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p id={`${topicId}-error`} role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Launch pipeline
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewRun(false);
                setFormError(null);
              }}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {runs.length === 0 || !activeRun ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No pipeline runs. Create one to walk through the {STAGE_COUNT} stages and their gates.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section aria-labelledby="runs-list-heading" className="space-y-3 lg:col-span-1">
            <h2
              id="runs-list-heading"
              className="text-sm font-semibold uppercase tracking-wider text-slate-600"
            >
              Runs ({runs.length})
            </h2>
            <ul className="space-y-3">
              {runs.map((run) => {
                const isActive = run.id === activeRun.id;
                return (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectRun(run.id);
                        setExpandedStage(run.currentStage);
                      }}
                      aria-pressed={isActive}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        isActive
                          ? 'border-blue-300 bg-blue-50 shadow-sm'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${runStatusDot[run.status] ?? 'bg-slate-400'}`}
                          aria-hidden="true"
                        />
                        <span className="text-xs capitalize text-slate-500">
                          {run.status.replace('_', ' ')}
                        </span>
                        <span className="ml-auto text-xs text-slate-400">
                          {formatRelativeTime(run.updatedAt)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm font-semibold text-slate-800">
                        {run.topic}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{run.journal}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex flex-1 gap-0.5" aria-hidden="true">
                          {run.stages.map((stage) => (
                            <div
                              key={stage.id}
                              className={`h-1 flex-1 rounded-full ${stageLineColors[stage.status]}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">{runProgress(run)}%</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-4 lg:col-span-2">
            <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">{activeRun.topic}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeRun.journal} · started {formatRelativeTime(activeRun.createdAt)}
                  </p>
                </div>
                {activeRun.noveltyScore > 0 && (
                  <div className="shrink-0 text-center">
                    <p className="text-2xl font-black text-violet-600">{activeRun.noveltyScore}</p>
                    <p className="text-xs text-slate-500">Novelty score</p>
                  </div>
                )}
              </div>
              {activeRun.paperTitle !== 'Pending…' && (
                <p className="mt-2 border-t border-slate-100 pt-2 text-xs italic text-slate-500">
                  📄 &ldquo;{activeRun.paperTitle}&rdquo;
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('literature', activeRun.id)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Literature
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('cfd', activeRun.id)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Evidence
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('review', activeRun.id)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Peer review
                </button>
              </div>
            </section>

            <section
              aria-labelledby="stages-heading"
              className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 id="stages-heading" className="font-semibold text-slate-800">
                  Pipeline stages
                </h2>
              </div>
              <div className="divide-y divide-slate-50">
                {activeRun.stages.map((stage) => (
                  <div key={stage.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStage((current) => (current === stage.id ? null : stage.id))
                      }
                      aria-expanded={expandedStage === stage.id}
                      aria-controls={`stage-panel-${stage.id}`}
                      className="w-full px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <StageSummary stage={stage} />
                        </div>
                        <svg
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expandedStage === stage.id ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>

                    {expandedStage === stage.id && (
                      <div
                        id={`stage-panel-${stage.id}`}
                        className="border-t border-slate-100 bg-slate-50 px-5 pb-4"
                      >
                        {Object.keys(stage.metrics ?? {}).length > 0 && (
                          <dl className="mb-3 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {Object.entries(stage.metrics ?? {}).map(([key, value]) => (
                              <div
                                key={key}
                                className="rounded-lg border border-slate-100 bg-white p-3"
                              >
                                <dt className="text-xs text-slate-500">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </dt>
                                <dd className="mt-0.5 text-sm font-bold text-slate-800">
                                  {String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        {stage.status === 'gate_pending' && (
                          <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl" aria-hidden="true">
                                ⏸
                              </span>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-orange-800">
                                  {stage.gateId ?? 'Gate'} — human-in-the-loop gate
                                </p>
                                <p className="mb-3 mt-1 text-xs text-orange-700">
                                  Review the {stage.name} output. Approving closes this stage and
                                  starts {activeRun.stages[stage.id + 1]?.name ?? 'completion'}.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void approveGate(activeRun.id, stage.gateId ?? '').then(() =>
                                        setExpandedStage(stage.id + 1),
                                      );
                                    }}
                                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                                  >
                                    ✓ Approve &amp; continue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void requestRevision(activeRun.id, stage.gateId ?? '')
                                    }
                                    disabled={busy}
                                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                                  >
                                    ✕ Send back for revision
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {stage.status === 'completed' && stage.gateApproved && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.5}
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                d="M5 13l4 4L19 7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            Gate approved in this session
                          </p>
                        )}

                        {stage.status === 'running' && (stage.revisionCount ?? 0) > 0 && (
                          <p className="mt-2 text-xs text-slate-500">
                            Revision {stage.revisionCount} requested by the reviewer — reopen the
                            gate when the stage produces new output.
                          </p>
                        )}

                        {stage.status === 'pending' && (
                          <p className="mt-3 text-xs text-slate-500">
                            Waiting for{' '}
                            {activeRun.stages[stage.id - 1]?.name ?? 'the previous stage'} to be
                            approved.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section
              aria-labelledby="logs-heading"
              className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 id="logs-heading" className="font-semibold text-slate-800">
                  Agent activity log
                </h2>
              </div>
              {runLogs.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">
                  No agent activity for this run. The fixture set only ships logs for the two
                  pre-seeded runs, and no backend is connected.
                </p>
              ) : (
                <ul className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
                  {runLogs.map((log) => (
                    <li key={log.id} className="flex gap-3 px-5 py-3">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          log.level === 'success'
                            ? 'bg-emerald-400'
                            : log.level === 'warn'
                              ? 'bg-orange-400'
                              : log.level === 'error'
                                ? 'bg-red-400'
                                : 'bg-blue-400'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="mb-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-medium text-slate-600">{log.agentId}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelativeTime(log.timestamp)}</span>
                          {log.costUsd !== null && log.costUsd !== undefined && (
                            <span>· ${log.costUsd.toFixed(3)}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-700">{log.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
