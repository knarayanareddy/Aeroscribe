import {
  GATE_CHECKPOINT_COUNT,
  STAGE_COUNT,
  currentStage,
  formatRelativeTime,
  runProgress,
} from '@aeroscribe/pipeline';
import { isLiteraturePayload, latestPayload } from '../api/mappers';
import { mockPapers, mockWikiArticles } from '../data/mockData';
import { usePipeline } from '../state/pipelineContext';
import type { View } from './Sidebar';

interface DashboardProps {
  onNavigate: (view: View, runId?: string) => void;
}

const statusStyles: Record<string, string> = {
  running: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  gate_pending: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  idle: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

const statusLabels: Record<string, string> = {
  running: '● Running',
  gate_pending: '⏸ Gate pending',
  completed: '✓ Completed',
  failed: '✕ Failed',
  idle: '○ Idle',
};

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { runs, mode, evidence, activeRun } = usePipeline();

  const activeRuns = runs.filter(
    (run) => run.status === 'running' || run.status === 'gate_pending',
  );
  const completedRuns = runs.filter((run) => run.status === 'completed');
  const gatesPending = runs.filter((run) => run.status === 'gate_pending');

  const stats = [
    {
      label: 'Active pipeline runs',
      value: String(activeRuns.length),
      change: `${gatesPending.length} awaiting your decision`,
      icon: '⚡',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      label: 'Completed runs',
      value: String(completedRuns.length),
      change: `${runs.length} runs total`,
      icon: '📄',
      color: 'from-emerald-500 to-teal-500',
    },
    mode === 'live'
      ? {
          label: 'Verified references',
          value: String(
            latestPayload(evidence, 'literature-search', isLiteraturePayload)?.papersVerified ?? 0,
          ),
          change: activeRun ? 'In the selected run' : 'Select a run',
          icon: '📚',
          color: 'from-violet-500 to-purple-600',
        }
      : {
          label: 'Papers in fixture set',
          value: String(mockPapers.length),
          change: 'Illustrative data',
          icon: '📚',
          color: 'from-violet-500 to-purple-600',
        },
    mode === 'live'
      ? {
          label: 'Evidence records',
          value: String(evidence.length),
          change: activeRun ? `Run ${activeRun.id}` : 'Select a run',
          icon: '🧾',
          color: 'from-orange-500 to-amber-500',
        }
      : {
          label: 'AeroWiki articles',
          value: String(mockWikiArticles.length),
          change: `${mockWikiArticles.filter((article) => article.status === 'draft').length} in draft`,
          icon: '🌐',
          color: 'from-orange-500 to-amber-500',
        },
  ];

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Research dashboard</h1>
          <p className="mt-1 text-slate-500">
            Prototype workspace for the {STAGE_COUNT}-stage AeroScribe pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('pipeline')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700"
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

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Workspace statistics
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div
                className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.color} text-lg`}
                aria-hidden="true"
              >
                {stat.icon}
              </div>
              <dd className="text-3xl font-bold text-slate-900">{stat.value}</dd>
              <dt className="mt-0.5 text-sm text-slate-500">{stat.label}</dt>
              <p className="mt-2 text-xs text-slate-400">{stat.change}</p>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="runs-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="runs-heading" className="text-lg font-semibold text-slate-900">
            Pipeline runs
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('pipeline')}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View all →
          </button>
        </div>

        {runs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No pipeline runs yet. Create one to see the {STAGE_COUNT}-stage flow.
          </p>
        ) : (
          <ul className="space-y-3">
            {runs.map((run) => {
              const stage = currentStage(run);
              const progress = runProgress(run);
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate('pipeline', run.id)}
                    aria-label={`Open pipeline run: ${run.topic}`}
                    className="w-full rounded-xl border border-slate-100 bg-white p-5 text-left shadow-sm transition-colors hover:border-blue-200 focus-visible:border-blue-400"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[run.status] ?? statusStyles.idle}`}
                          >
                            {statusLabels[run.status] ?? run.status}
                          </span>
                          <span className="text-xs text-slate-400">{run.journal}</span>
                          <span className="text-xs text-slate-400">
                            · updated {formatRelativeTime(run.updatedAt)}
                          </span>
                        </div>
                        <h3 className="truncate text-sm font-semibold text-slate-800">
                          {run.topic}
                        </h3>
                        <p className="mt-1 truncate text-xs italic text-slate-500">
                          &ldquo;{run.paperTitle}&rdquo;
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-slate-900">
                          {
                            run.stages.filter((candidate) => candidate.status === 'completed')
                              .length
                          }
                          /{run.stages.length || STAGE_COUNT}
                        </p>
                        <p className="text-xs text-slate-400">stages</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex gap-1" aria-hidden="true">
                        {run.stages.map((candidate) => (
                          <div
                            key={candidate.id}
                            className={`h-1.5 flex-1 rounded-full ${
                              candidate.status === 'completed'
                                ? 'bg-emerald-400'
                                : candidate.status === 'running'
                                  ? 'bg-blue-400 motion-safe:animate-pulse'
                                  : candidate.status === 'gate_pending'
                                    ? 'bg-orange-400'
                                    : candidate.status === 'failed'
                                      ? 'bg-red-400'
                                      : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                        <span>{stage?.name ?? 'Complete'}</span>
                        <span>{progress}%</span>
                      </div>
                    </div>

                    {run.status === 'gate_pending' && stage && (
                      <p className="mt-3 flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-700">
                        <svg
                          className="h-3.5 w-3.5 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>
                          <strong className="font-semibold">Action required:</strong>{' '}
                          {stage.gateId ?? 'Gate'} needs your approval to continue
                        </span>
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section
          aria-labelledby="principles-heading"
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <h2 id="principles-heading" className="mb-4 font-semibold text-slate-800">
            🧬 Operating principles
          </h2>
          <ul className="space-y-3">
            {[
              {
                icon: '🚫',
                label: 'Zero fabrication',
                description:
                  'No invented numbers. Every value must trace to the evidence registry.',
              },
              {
                icon: '🔐',
                label: 'Verified registry',
                description: 'SHA-256 checksums on every computed evidence artefact.',
              },
              {
                icon: '🎯',
                label: 'Journal calibration',
                description: 'Formatting rules per journal (AIAA, Elsevier, Acta Astronautica).',
              },
              {
                icon: '👤',
                label: 'Human-in-the-loop',
                description: `A researcher decision gate closes each of the ${STAGE_COUNT} pipeline stages — ${GATE_CHECKPOINT_COUNT} checkpoints in the specification.`,
              },
            ].map((principle) => (
              <li key={principle.label} className="flex gap-3">
                <span className="text-lg" aria-hidden="true">
                  {principle.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">{principle.label}</p>
                  <p className="text-xs text-slate-500">{principle.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="wiki-heading"
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id="wiki-heading" className="font-semibold text-slate-800">
              🌐 AeroWiki
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('wiki')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all →
            </button>
          </div>
          <ul className="space-y-2.5">
            {mockWikiArticles.slice(0, 5).map((article) => (
              <li
                key={article.id}
                className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${article.status === 'published' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{article.title}</p>
                    <p className="text-xs text-slate-400">
                      {article.category} · {article.papersLinked} papers
                    </p>
                  </div>
                </div>
                <span className="ml-2 shrink-0 text-xs text-slate-400">{article.lastUpdated}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
