import { describe, expect, it } from 'vitest';
import { formatMeasuredValue, formatNumber, formatPercent, truncateHash } from './format';

describe('formatMeasuredValue', () => {
  it('rounds the value to the precision of the uncertainty', () => {
    expect(formatMeasuredValue(1842.3, 12.4)).toBe('1842 ± 12');
    expect(formatMeasuredValue(4312, 38)).toBe('4312 ± 40');
  });

  it('keeps two significant digits when the leading digit is 1 or 2', () => {
    expect(formatMeasuredValue(0.9417, 0.0031)).toBe('0.942 ± 0.003');
    expect(formatMeasuredValue(3.72, 0.18)).toBe('3.72 ± 0.18');
    expect(formatMeasuredValue(18.6, 0.4)).toBe('18.6 ± 0.4');
  });

  it('does not invent precision when no uncertainty is available', () => {
    expect(formatMeasuredValue(0.9417, 0)).toBe('0.9417');
    expect(formatMeasuredValue(96, Number.NaN)).toBe('96');
  });

  it('handles non-finite input', () => {
    expect(formatMeasuredValue(Number.NaN, 1)).toBe('—');
    expect(formatMeasuredValue(Number.POSITIVE_INFINITY, 1)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('keeps integers intact and trims float noise', () => {
    expect(formatNumber(4312)).toBe('4312');
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(-0.125)).toBe('-0.125');
  });

  it('uses exponential notation for very small values', () => {
    expect(formatNumber(0.00000012)).toBe('1.20e-7');
  });

  it('handles non-finite input', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats percentages and clamps NaN to zero', () => {
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(33.333, 1)).toBe('33.3%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});

describe('truncateHash', () => {
  it('shortens long hashes and leaves short ones alone', () => {
    expect(truncateHash('a'.repeat(64))).toBe('aaaaaaaaaaaa…aaaa');
    expect(truncateHash('abc')).toBe('abc');
  });
});
