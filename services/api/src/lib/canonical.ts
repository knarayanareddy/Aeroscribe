import { createHash } from 'node:crypto';

/**
 * Deterministic JSON serialisation used for every hash in the evidence registry.
 *
 * Object keys are sorted, `undefined` properties are dropped and non-finite
 * numbers are rejected, so two structurally identical payloads always produce
 * the same bytes on every machine and every Node version. Without this, a
 * checksum would silently depend on property insertion order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
  if (value === null) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Cannot hash a non-finite number (${String(value)})`);
    }
    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) return value.map(canonicalise);

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      result[key] = canonicalise(entry);
    }
    return result;
  }

  throw new TypeError(`Cannot hash a ${typeof value} value`);
}

/** Lower-case SHA-256 hex digest of a UTF-8 string. */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** SHA-256 of the canonical JSON encoding of a value. */
export function hashPayload(payload: unknown): string {
  return sha256(canonicalJson(payload));
}

/** The `prevHash` of the first record in a chain. */
export const GENESIS_HASH = '0'.repeat(64);

/** Compare two hex digests without leaking where they differ. */
export function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
