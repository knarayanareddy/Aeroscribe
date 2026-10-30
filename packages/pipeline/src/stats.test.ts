import { describe, expect, it } from 'vitest';
import {
  completedStageCount,
  currentStage,
  formatRelativeTime,
  reviewStats,
  runProgress,
  runsAwaitingGate,
  severityBreakdown,
} from './stats';
import type { PipelineRun, ReviewComment } from './types';

const run: PipelineRun = {
  id: 'run-1',
  topic: 'Topic',
  journal: 'AIAA Journal',
  status: 'running',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  currentStage: 1,
  noveltyScore: 0,
  paperTitle: 'Pending…',
  stages: [
    { id: 0, name: 'Topic', shortName: 'Topic', status: 'completed', agentsActive: [] },
    { id: 1, name: 'Literature', shortName: 'Literature', status: 'running', agentsActive: [] },
    { id: 2, name: 'Novelty', shortName: 'Novelty', status: 'pending', agentsActive: [] },
  ],
};

const comments: ReviewComment[] = [
  {
    id: 'c1',
    reviewerId: 'a',
    reviewerName: 'A',
    section: 'Intro',
    severity: 'major',
    comment: '…',
    resolved: false,
  },
  {
    id: 'c2',
    reviewerId: 'b',
    reviewerName: 'B',
    section: 'Methods',
    severity: 'minor',
    comment: '…',
    resolved: true,
  },
];

describe('pipeline stats', () => {
  it('counts completed stages and rounds progress', () => {
    expect(completedStageCount(run)).toBe(1);
    expect(runProgress(run)).toBe(33);
  });

  it('never divides by zero when a run has no stages', () => {
    const empty = { ...run, stages: [] };
    expect(runProgress(empty)).toBe(0);
    expect(Number.isNaN(runProgress(empty))).toBe(false);
  });

  it('resolves the current stage, falling back to the last stage', () => {
    expect(currentStage(run)?.id).toBe(1);
    expect(currentStage({ ...run, currentStage: 99 })?.id).toBe(2);
    expect(currentStage({ ...run, stages: [] })).toBeUndefined();
  });

  it('lists runs awaiting a gate', () => {
    expect(runsAwaitingGate([run, { ...run, id: 'r2', status: 'gate_pending' }])).toHaveLength(1);
  });
});

describe('reviewStats', () => {
  it('summarises comments', () => {
    expect(reviewStats(comments)).toEqual({
      total: 2,
      resolved: 1,
      majorUnresolved: 1,
      resolutionRate: 50,
    });
  });

  it('returns a zeroed report instead of NaN for an empty list', () => {
    const stats = reviewStats([]);
    expect(stats).toEqual({ total: 0, resolved: 0, majorUnresolved: 0, resolutionRate: 0 });
    expect(Number.isNaN(stats.resolutionRate)).toBe(false);
  });

  it('breaks down by severity without dividing by zero', () => {
    expect(severityBreakdown(comments, 'major')).toEqual({ total: 1, resolved: 0, percent: 0 });
    expect(severityBreakdown(comments, 'suggestion')).toEqual({
      total: 0,
      resolved: 0,
      percent: 0,
    });
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it.each([
    ['2026-05-01T11:59:40Z', 'just now'],
    ['2026-05-01T11:30:00Z', '30m ago'],
    ['2026-05-01T09:00:00Z', '3h ago'],
    ['2026-04-28T12:00:00Z', '3d ago'],
    ['2026-03-01T12:00:00Z', '2mo ago'],
    ['2025-03-01T12:00:00Z', '1y ago'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it('degrades gracefully for invalid input', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('unknown');
  });
});
