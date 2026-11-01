// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { extractDois, extractNumericTokens } from '../src/claims/extract';
import { buildPolicy, verifyClaims } from '../src/claims/verify';
import type { EvidenceRecord } from '../src/store';

function record(payload: unknown): EvidenceRecord {
  return {
    seq: 0,
    id: 'id',
    kind: 'cfd-run',
    runId: 'run-1',
    stageId: null,
    label: 'test',
    createdAt: '2026-10-30T12:00:00.000Z',
    payload,
    payloadHash: 'x',
    prevHash: 'y',
    hash: 'z',
  };
}

const evidence = [
  record({
    value: 0.6234,
    uncertainty: 0.0012,
    gci: { fineGciPercent: 0.19, apparentOrder: 2.01 },
    references: [{ doi: '10.2514/1.J060000' }],
  }),
];

describe('extractNumericTokens', () => {
  it('finds numbers, units, exponents and percentages', () => {
    const tokens = extractNumericTokens('Drag fell 12.5% to 0.6234 and RMS was 4.2e-7 Pa.');
    expect(tokens.map((token) => token.value)).toEqual([12.5, 0.6234, 4.2e-7]);
    expect(tokens[0]!.unit).toBe('%');
    expect(tokens[2]!.unit).toBe('Pa');
  });

  it('keeps negative numbers', () => {
    expect(extractNumericTokens('a lift of -0.25').map((token) => token.value)).toEqual([-0.25]);
  });

  it('extracts DOIs only when they look like DOIs', () => {
    expect(
      extractDois('see doi:10.2514/1.J060000 and 10.1016/j.ast.2024.01.001').map(
        (d) => d.normalised,
      ),
    ).toEqual(['10.2514/1.j060000', '10.1016/j.ast.2024.01.001']);
    expect(extractDois('version 10.2 of the code')).toEqual([]);
  });
});

describe('buildPolicy', () => {
  it('collects every finite number and every DOI-shaped string', () => {
    const policy = buildPolicy(evidence);
    expect(policy.allowedValues.map((entry) => entry.value)).toEqual([0.6234, 0.0012, 0.19, 2.01]);
    expect(policy.allowedDois).toEqual(['10.2514/1.j060000']);
  });

  it('ignores non-finite numbers', () => {
    const policy = buildPolicy([record({ ok: 1, bad: Number.NaN })]);
    expect(policy.allowedValues.map((entry) => entry.value)).toEqual([1]);
  });
});

describe('verifyClaims', () => {
  const policy = buildPolicy(evidence);

  it('accepts text whose numbers all appear in evidence', () => {
    const report = verifyClaims(
      'The drag coefficient is 0.6234 with an uncertainty of 0.0012 and a GCI of 0.19 percent at order 2.01.',
      policy,
    );
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(4);
  });

  it('rejects an invented number', () => {
    const report = verifyClaims('The drag coefficient is 0.9999, a 60% improvement.', policy);
    expect(report.ok).toBe(false);
    expect(report.unbacked.map((claim) => claim.token)).toEqual(['0.9999', '60%']);
  });

  it('allows structural references, citation markers and years', () => {
    const report = verifyClaims(
      'Figure 3 and Table 2 summarise Section 4; see [7] and the campaign described by Roe (2024).',
      policy,
    );
    expect(report.ok).toBe(true);
  });

  it('does not allow a number that merely looks like a year', () => {
    expect(verifyClaims('The model reduces drag by 2024 units.', policy).ok).toBe(false);
    expect(verifyClaims('Costs fell by 2024.', policy).ok).toBe(false);
  });

  it('rejects a DOI that was not verified for this run', () => {
    const report = verifyClaims('As shown in 10.1016/j.ast.2024.01.001, drag falls.', policy);
    expect(report.ok).toBe(false);
    expect(report.unbacked[0]!.reason).toMatch(/RULE-002/);
  });

  it('accepts a DOI that was verified for this run', () => {
    const report = verifyClaims('As shown in 10.2514/1.J060000, drag falls.', policy);
    expect(report.ok).toBe(true);
    expect(report.observedDois).toEqual(['10.2514/1.j060000']);
  });

  it('is tolerant of float formatting but not of different values', () => {
    expect(verifyClaims('value 0.623400', buildPolicy([record({ value: 0.6234 })])).ok).toBe(true);
    expect(verifyClaims('value 0.624', buildPolicy([record({ value: 0.6234 })])).ok).toBe(false);
  });
});
