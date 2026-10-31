import { usePipeline } from '../state/pipelineContext';

/**
 * Says where the numbers on screen come from.
 *
 * The rule it enforces is simple and absolute: there is no state in which the
 * dashboard shows numbers without saying whether they are fixtures or a live
 * API, and there is no state in which a failed API call is papered over with
 * fixtures. `unreachable` keeps the error and offers a retry; it never
 * substitutes data.
 */
export default function DataModeBadge() {
  const { mode, sourceLabel, status, error, refresh } = usePipeline();

  const tone =
    status === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : mode === 'live'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-amber-200 bg-amber-50 text-amber-800';

  const label =
    status === 'error'
      ? `API unreachable${error ? ` · ${error}` : ''}`
      : status === 'loading'
        ? 'Loading…'
        : mode === 'live'
          ? sourceLabel
          : sourceLabel;

  return (
    <div
      role="status"
      data-testid="data-mode-badge"
      className={`flex flex-wrap items-center gap-2 border-b px-4 py-1.5 text-xs font-medium sm:px-6 ${tone}`}
    >
      <span aria-hidden="true">{status === 'error' ? '⚠' : mode === 'live' ? '●' : '◆'}</span>
      <span>{label}</span>
      {status === 'error' && (
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-red-300 bg-white px-2 py-0.5 font-semibold text-red-700 hover:bg-red-100"
        >
          Try again
        </button>
      )}
      {mode === 'fixtures' && status !== 'error' && (
        <span className="font-normal text-amber-700">
          Illustrative data. Not the output of any pipeline run.
        </span>
      )}
    </div>
  );
}
