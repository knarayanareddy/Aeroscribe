import { useId, useState } from 'react';
import { isReviewPayload, latestPayload, toLiveReview } from '../api/mappers';
import { useActiveRun, useEvidence } from '../state/pipelineContext';

type Severity = 'major' | 'minor';

const severityStyles: Record<Severity, string> = {
  major: 'border-red-200 bg-red-100 text-red-700',
  minor: 'border-amber-200 bg-amber-100 text-amber-800',
};

/**
 * The review council's own record.
 *
 * The reviewers are deterministic checks, so there is no reviewer identity to
 * show and no "resolve" action: a finding is resolved by changing the evidence
 * and re-running the stage, not by clicking a button. That is why this view is
 * read-only — the fixture version offered resolution because its comments were
 * invented, and resolving an invented comment proves nothing.
 */
export default function ReviewLive() {
  const activeRun = useActiveRun();
  const records = useEvidence();
  const payload = latestPayload(records, 'review-report', isReviewPayload);
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const filterId = useId();

  if (!activeRun) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Peer review</h1>
        <p className="mt-2 text-sm text-slate-500">Select a run to see its review record.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Peer review</h1>
        <p
          data-testid="review-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"
        >
          This run has no review record. Stage 6 writes one after the manuscript stage is approved.
        </p>
      </div>
    );
  }

  const review = toLiveReview(payload);
  const comments = review.comments.filter(
    (comment) => filter === 'all' || comment.severity === filter,
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Peer review</h1>
        <p className="mt-1 text-slate-500">
          {review.manuscriptTitle} · reviewed {new Date(review.reviewedAt).toLocaleString()}
        </p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 ${
          review.verdict === 'pass'
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-orange-200 bg-orange-50'
        }`}
      >
        <p
          className={`text-sm font-semibold ${
            review.verdict === 'pass' ? 'text-emerald-900' : 'text-orange-900'
          }`}
        >
          Verdict: {review.verdict === 'pass' ? 'Pass' : 'Revise'}
        </p>
        <p className="mt-1 text-xs text-slate-700">
          {review.passedChecks} of {review.checks.length} checks passed. The council is
          deterministic: each finding names the rule it enforces, and there is no language model
          behind it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">Checks</h2>
          <ul className="space-y-1.5 text-sm">
            {review.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={check.passed ? 'text-emerald-600' : 'text-red-600'}
                >
                  {check.passed ? '✓' : '✕'}
                </span>
                <span className="text-slate-700">{check.description}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-400">
                  {check.id}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Comments ({review.comments.length})
            </h2>
            <div>
              <label htmlFor={filterId} className="sr-only">
                Filter by severity
              </label>
              <select
                id={filterId}
                value={filter}
                onChange={(event) => setFilter(event.target.value as 'all' | Severity)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                <option value="all">All severities</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </div>
          </div>

          <ul className="space-y-2">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityStyles[comment.severity]}`}
                  >
                    {comment.severity}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">
                    {comment.section}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">{comment.id}</span>
                </div>
                <p className="text-sm text-slate-700">{comment.comment}</p>
              </li>
            ))}
            {comments.length === 0 && (
              <li className="text-sm italic text-slate-500">
                {review.comments.length === 0
                  ? 'The council raised no comments.'
                  : 'No comment matches that filter.'}
              </li>
            )}
          </ul>

          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            These findings are not editable here. A finding is answered by changing the evidence and
            re-running the stage, so the record of what was found stays attached to the run.
          </p>
        </section>
      </div>
    </div>
  );
}
