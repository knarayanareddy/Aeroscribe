// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, canonicalJson, hashEquals, hashPayload, sha256 } from '../src/lib/canonical';

describe('canonicalJson', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it('drops undefined properties but keeps null', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: null })).toBe('{"a":1,"c":null}');
  });

  it('serialises dates as ISO strings', () => {
    expect(canonicalJson({ at: new Date('2026-10-30T12:00:00Z') })).toBe(
      '{"at":"2026-10-30T12:00:00.000Z"}',
    );
  });

  it('refuses non-finite numbers instead of hashing NaN', () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });
});

describe('hashing helpers', () => {
  it('produces a 64 character lowercase hex digest', () => {
    const digest = sha256('aeroscribe');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(sha256('aeroscribe'));
  });

  it('hashes structurally equal payloads identically', () => {
    expect(hashPayload({ x: 1, y: [1, 2, 3] })).toBe(hashPayload({ y: [1, 2, 3], x: 1 }));
    expect(hashPayload({ x: 1 })).not.toBe(hashPayload({ x: 2 }));
  });

  it('compares digests without early exit on length mismatch', () => {
    expect(hashEquals(sha256('a'), sha256('a'))).toBe(true);
    expect(hashEquals(sha256('a'), sha256('b'))).toBe(false);
    expect(hashEquals('abc', 'abcd')).toBe(false);
  });

  it('exposes a genesis hash of 64 zeros', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
  });
});
