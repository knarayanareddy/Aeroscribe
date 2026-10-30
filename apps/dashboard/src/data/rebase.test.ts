import { describe, expect, it } from 'vitest';
import { rebaseFixture, shiftTimestamps } from './rebase';

describe('shiftTimestamps', () => {
  it('shifts ISO timestamps at any depth and leaves other strings alone', () => {
    const fixture = {
      updatedAt: '2026-04-29T10:15:00Z',
      topic: 'RDE stability',
      stages: [{ startedAt: '2026-04-29T08:00:00Z', duration: 14, agents: ['A'] }],
    };

    const shifted = shiftTimestamps(fixture, 60 * 60 * 1000);

    expect(shifted.updatedAt).toBe('2026-04-29T11:15:00.000Z');
    expect(shifted.stages[0]?.startedAt).toBe('2026-04-29T09:00:00.000Z');
    expect(shifted.topic).toBe('RDE stability');
    expect(shifted.stages[0]?.duration).toBe(14);
  });

  it('does not mutate the input', () => {
    const fixture = { updatedAt: '2026-04-29T10:15:00Z' };
    const shifted = shiftTimestamps(fixture, 1000);
    expect(fixture.updatedAt).toBe('2026-04-29T10:15:00Z');
    expect(shifted.updatedAt).not.toBe(fixture.updatedAt);
  });

  it('ignores date-only strings and invalid dates', () => {
    const fixture = { lastUpdated: '2026-04-28', timestamp: '2026-04-29T10:15:00Z' };
    expect(shiftTimestamps(fixture, 1000)).toEqual({
      lastUpdated: '2026-04-28',
      timestamp: '2026-04-29T10:15:01.000Z',
    });
  });
});

describe('rebaseFixture', () => {
  it('places the newest timestamp a fixed number of hours before now', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    const shifted = rebaseFixture(
      { updatedAt: '2026-04-29T10:15:00Z' },
      '2026-04-29T10:15:00Z',
      2,
      now,
    );

    expect(Date.parse(shifted.updatedAt)).toBe(now - 2 * 3_600_000);
  });
});
