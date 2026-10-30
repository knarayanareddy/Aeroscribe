const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Recursively shift every ISO-8601 timestamp in a fixture by `shiftMs`.
 *
 * Fixture data is written with fixed dates so it stays reviewable in diffs, but
 * a demo that says "last updated 2026-04-29" looks stale forever. Rendering
 * rebases the newest timestamp to a couple of hours ago without editing the
 * fixtures themselves.
 */
export function shiftTimestamps<T>(value: T, shiftMs: number): T {
  if (typeof value === 'string') {
    if (!ISO_TIMESTAMP.test(value)) return value;
    return new Date(Date.parse(value) + shiftMs).toISOString() as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shiftTimestamps(item, shiftMs)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const shifted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      shifted[key] = shiftTimestamps(entry, shiftMs);
    }
    return shifted as T;
  }

  return value;
}

/** Shift a fixture set so its newest timestamp sits `hoursAgo` hours before `now`. */
export function rebaseFixture<T>(
  value: T,
  newestIsoTimestamp: string,
  hoursAgo = 2,
  now: number = Date.now(),
): T {
  const newest = Date.parse(newestIsoTimestamp);
  if (Number.isNaN(newest)) return value;
  return shiftTimestamps(value, now - hoursAgo * 3_600_000 - newest);
}
