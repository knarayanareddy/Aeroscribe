/**
 * Format a measured quantity with its uncertainty using the GUM/PDG rounding
 * convention: the uncertainty is reported to one significant digit, or two when
 * the leading digit is 1 or 2, and the value is rounded to the same decimal place.
 *
 * `formatMeasuredValue(1842.3, 12.4)` → `"1842 ± 12"`
 * `formatMeasuredValue(0.9417, 0.0031)` → `"0.942 ± 0.003"`
 */
export function formatMeasuredValue(value: number, uncertainty: number): string {
  if (!Number.isFinite(value)) return '—';
  if (!Number.isFinite(uncertainty) || uncertainty <= 0) return formatNumber(value);

  const order = Math.floor(Math.log10(uncertainty));
  const leadingDigit = uncertainty / 10 ** order;
  const significantDigits = leadingDigit < 3 ? 2 : 1;

  const roundedUncertainty = Number(uncertainty.toPrecision(significantDigits));
  const decimals = Math.max(0, significantDigits - 1 - Math.floor(Math.log10(roundedUncertainty)));

  if (decimals > 8) {
    return `${value.toExponential(2)} ± ${uncertainty.toExponential(1)}`;
  }

  return `${value.toFixed(decimals)} ± ${roundedUncertainty.toFixed(decimals)}`;
}

/**
 * Format a plain number for display without inventing precision:
 * integers keep their digits, small fractions keep up to six significant digits.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) < 0.001) return value.toExponential(2);
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.min(6, Math.max(0, 5 - magnitude));
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

/** Percent label that never renders NaN. */
export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(fractionDigits)}%`;
}

/** Trim a long hash for display, keeping the head and tail. */
export function truncateHash(hash: string, head = 12, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
