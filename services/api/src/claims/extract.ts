/** One numeric token found in text, with enough context to review it. */
export interface NumericToken {
  raw: string;
  value: number;
  /** Unit or trailing symbol directly after the number (`%`, `m/s`, …). */
  unit: string | null;
  /** Index of the first character of the number in the source text. */
  index: number;
  /** ~40 characters of surrounding text for diagnostics. */
  context: string;
}

export interface DoiToken {
  raw: string;
  normalised: string;
  index: number;
}

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * Units recognised after a space. Anything else after a space is prose, not a
 * unit: without this whitelist "2024 campaign" would parse as a quantity in
 * "campaign", and every year in a reference list would look like a claim.
 */
const SPACED_UNITS = new Set([
  '%',
  '°',
  '°C',
  'deg',
  'rad',
  'K',
  'Pa',
  'kPa',
  'MPa',
  'GPa',
  'N',
  'kN',
  'm',
  'mm',
  'cm',
  'km',
  's',
  'ms',
  'h',
  'kg',
  'g',
  'mg',
  'J',
  'kJ',
  'W',
  'kW',
  'MW',
  'Hz',
  'kHz',
  'MHz',
  'V',
  'mV',
  'A',
  'mA',
  'mol',
  'ppm',
  'ppb',
  'dB',
  'm/s',
  'km/s',
  'rad/s',
  'kg/m3',
  'N/m2',
  'W/m2',
]);

/** Symbols that may be attached to a number without a space (`12%`, `4ms`). */
const ATTACHED_UNIT = /^(?:%|°[CF]?|[A-Za-zµμ][A-Za-z0-9/^·°µμ%]{0,5})/;

function unitAfter(text: string, end: number): { unit: string | null; length: number } {
  const rest = text.slice(end);

  const attached = rest.match(ATTACHED_UNIT);
  if (attached) return { unit: attached[0], length: attached[0].length };

  const spaced = rest.match(/^\s+(\S+)/);
  if (spaced?.[1]) {
    const candidate = spaced[1].replace(/[.,;:)]+$/, '');
    if (SPACED_UNITS.has(candidate)) {
      return { unit: candidate, length: spaced[0].length - spaced[1].length + candidate.length };
    }
  }

  return { unit: null, length: 0 };
}

/**
 * Extract every number from a piece of text.
 *
 * Deliberately greedy: it reports numbers it might not care about (figure
 * numbers, years, citation markers) so the verifier — not the extractor —
 * decides what counts as a claim. Extraction that filters early is how
 * fabricated values slip through.
 */
export function extractNumericTokens(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];

  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const numericPart = match[0];
    const index = match.index ?? 0;
    const value = Number.parseFloat(numericPart);
    if (!Number.isFinite(value)) continue;

    const end = index + numericPart.length;
    const { unit, length } = unitAfter(text, end);

    tokens.push({
      raw: text.slice(index, end + length),
      value,
      unit,
      index,
      context: text.slice(Math.max(0, index - 40), Math.min(text.length, end + length + 40)),
    });
  }

  return tokens;
}

const DOI_IN_TEXT = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+\b/gi;

/** Every DOI-shaped string in the text. */
export function extractDois(text: string): DoiToken[] {
  return Array.from(text.matchAll(DOI_IN_TEXT), (match) => ({
    raw: match[0],
    normalised: match[0].toLowerCase(),
    index: match.index ?? 0,
  }));
}

/**
 * How many significant digits a written number shows.
 *
 * `0.4264` → 4, `2.00` → 3, `3.36e-6` → 3, `0` → 1. The verifier uses this to
 * decide whether a quoted value is a correct rounding of an evidence value: a
 * paper may print `0.4264` for a stored `0.42639127…`, but not `0.43`.
 */
export function significantDigits(raw: string): number {
  const numeric = raw.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
  if (!numeric) return 1;
  const mantissa = numeric.split(/[eE]/)[0]!.replace(/[-.]/g, '');
  const trimmed = mantissa.replace(/^0+/, '');
  return trimmed.length === 0 ? 1 : trimmed.length;
}

export const STRUCTURAL_REFERENCE =
  /(?:figure|fig\.?|table|section|sec\.?|equation|eq\.?|ref\.?|reference|algorithm|step|appendix)\s*$/i;
