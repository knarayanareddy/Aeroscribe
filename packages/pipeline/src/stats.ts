import type { PipelineRun, ReviewComment, StageInfo } from './types';

export function completedStageCount(run: PipelineRun): number {
  return run.stages.filter((stage) => stage.status === 'completed').length;
}

/** Percentage of stages completed, rounded to a whole number. Never NaN. */
export function runProgress(run: PipelineRun): number {
  if (run.stages.length === 0) return 0;
  return Math.round((completedStageCount(run) / run.stages.length) * 100);
}

export function currentStage(run: PipelineRun): StageInfo | undefined {
  return run.stages.find((stage) => stage.id === run.currentStage) ?? run.stages.at(-1);
}

export function runsAwaitingGate(runs: readonly PipelineRun[]): PipelineRun[] {
  return runs.filter((run) => run.status === 'gate_pending');
}

export interface ReviewStats {
  total: number;
  resolved: number;
  majorUnresolved: number;
  /** Whole-number percentage in [0, 100]. 0 when there are no comments. */
  resolutionRate: number;
}

/**
 * Aggregate peer-review comments.
 *
 * Guards the empty case explicitly: the previous implementation divided by zero
 * and rendered `NaN%` whenever no comments were loaded.
 */
export function reviewStats(comments: readonly ReviewComment[]): ReviewStats {
  const total = comments.length;
  const resolved = comments.filter((comment) => comment.resolved).length;
  const majorUnresolved = comments.filter(
    (comment) => comment.severity === 'major' && !comment.resolved,
  ).length;

  return {
    total,
    resolved,
    majorUnresolved,
    resolutionRate: total === 0 ? 0 : Math.round((resolved / total) * 100),
  };
}

export function severityBreakdown(
  comments: readonly ReviewComment[],
  severity: ReviewComment['severity'],
): { total: number; resolved: number; percent: number } {
  const total = comments.filter((comment) => comment.severity === severity).length;
  const resolved = comments.filter(
    (comment) => comment.severity === severity && comment.resolved,
  ).length;
  return { total, resolved, percent: total === 0 ? 0 : Math.round((resolved / total) * 100) };
}

/** Human-readable "time ago" label for fixture timestamps. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const diffMs = now.getTime() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}
