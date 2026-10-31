import { reviewStats, severityBreakdown, type ReviewComment } from '@aeroscribe/pipeline';
import { useId, useState } from 'react';
import { mockReviewComments } from '../data/mockData';
import { usePipeline } from '../state/pipelineContext';
import ReviewLive from './ReviewLive';

type SeverityFilter = 'all' | ReviewComment['severity'];

const severityStyles: Record<ReviewComment['severity'], { badge: string; bar: string }> = {
  major: { badge: 'border-red-200 bg-red-100 text-red-700', bar: 'bg-red-400' },
  minor: { badge: 'border-amber-200 bg-amber-100 text-amber-800', bar: 'bg-amber-400' },
  suggestion: { badge: 'border-blue-200 bg-blue-100 text-blue-700', bar: 'bg-blue-400' },
};

const reviewerColors: Record<string, string> = {
  ReviewerAAgent: 'bg-violet-100 text-violet-700',
  ReviewerBAgent: 'bg-blue-100 text-blue-700',
  ReviewerCAgent: 'bg-cyan-100 text-cyan-700',
  ReviewerDAgent: 'bg-emerald-100 text-emerald-700',
  MetaReviewerAgent: 'bg-red-100 text-red-700',
};

interface ReviewViewProps {
  /** Override the fixture comments (used by tests). */
  initialComments?: ReviewComment[];
}

export default function ReviewView({ initialComments = mockReviewComments }: ReviewViewProps) {
  const [comments, setComments] = useState<ReviewComment[]>(initialComments);
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const responseId = useId();

  const { mode } = usePipeline();

  // Live mode is read-only, and it is a different component: the fixture view
  // can resolve comments because they are invented; the server's cannot be
  // resolved by a click.
  if (mode === 'live') return <ReviewLive />;

  const stats = reviewStats(comments);
  const filtered = comments.filter(
    (comment) =>
      (filter === 'all' || comment.severity === filter) && (showResolved || !comment.resolved),
  );

  const resolve = (id: string) => {
    setComments((current) =>
      current.map((comment) =>
        comment.id === id
          ? {
              ...comment,
              resolved: true,
              response: responseText.trim() || comment.response || 'Addressed in revision.',
            }
          : comment,
      ),
    );
    setRespondingTo(null);
    setResponseText('');
  };

  const filters: SeverityFilter[] = ['all', 'major', 'minor', 'suggestion'];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Peer review council</h1>
        <p className="mt-1 text-slate-500">
          Four specialist reviewers plus a meta-reviewer · illustrative comments
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total comments', value: stats.total, color: 'text-slate-900' },
          { label: 'Major unresolved', value: stats.majorUnresolved, color: 'text-red-600' },
          { label: 'Resolved', value: stats.resolved, color: 'text-emerald-600' },
          { label: 'Resolution rate', value: `${stats.resolutionRate}%`, color: 'text-blue-600' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm"
          >
            <dd className={`text-3xl font-bold ${item.color}`}>{item.value}</dd>
            <dt className="mt-1 text-xs text-slate-500">{item.label}</dt>
          </div>
        ))}
      </dl>

      <section
        aria-labelledby="resolution-progress"
        className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="resolution-progress" className="text-sm font-semibold text-slate-800">
            Resolution progress by severity
          </h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              stats.majorUnresolved > 0
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {stats.majorUnresolved > 0
              ? `${stats.majorUnresolved} major issues unresolved`
              : 'All major issues resolved'}
          </span>
        </div>

        <dl className="space-y-3">
          {(['major', 'minor', 'suggestion'] as const).map((severity) => {
            const breakdown = severityBreakdown(comments, severity);
            return (
              <div key={severity}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <dt className="capitalize">{severity}</dt>
                  <dd>
                    {breakdown.resolved}/{breakdown.total} · {breakdown.percent}%
                  </dd>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={breakdown.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${severity} comments resolved`}
                >
                  <div
                    className={`h-full rounded-full ${severityStyles[severity].bar}`}
                    style={{ width: `${breakdown.percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
          role="group"
          aria-label="Filter by severity"
        >
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                filter === option
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Show resolved
        </label>

        <p className="ml-auto text-sm text-slate-500" aria-live="polite">
          {filtered.length} comment{filtered.length === 1 ? '' : 's'} shown
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No comments match this filter.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((comment) => (
            <li
              key={comment.id}
              className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${reviewerColors[comment.reviewerId] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {comment.reviewerName}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityStyles[comment.severity].badge}`}
                >
                  {comment.severity}
                </span>
                <span className="text-xs text-slate-400">{comment.section}</span>
                {comment.resolved && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    ✓ resolved
                  </span>
                )}
              </div>

              <p className="text-sm leading-relaxed text-slate-700">{comment.comment}</p>

              {comment.resolved && comment.response && (
                <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                  <strong className="font-semibold">Response:</strong> {comment.response}
                </p>
              )}

              {!comment.resolved && (
                <div className="mt-4">
                  {respondingTo === comment.id ? (
                    <div className="space-y-2">
                      <label
                        htmlFor={`${responseId}-${comment.id}`}
                        className="block text-xs font-medium text-slate-600"
                      >
                        Response to the reviewer
                      </label>
                      <textarea
                        id={`${responseId}-${comment.id}`}
                        value={responseText}
                        onChange={(event) => setResponseText(event.target.value)}
                        rows={3}
                        placeholder="Describe the change made in the manuscript…"
                        className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => resolve(comment.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Mark resolved
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRespondingTo(null);
                            setResponseText('');
                          }}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRespondingTo(comment.id);
                        setResponseText('');
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Respond &amp; resolve
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
