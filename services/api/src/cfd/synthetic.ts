import { canonicalJson, hashPayload } from '../lib/canonical';
import { hashBytes } from '../store/evidence';
import { computeGci, gciUncertainty } from './gci';
import type { CfdStudyRequest, CfdStudyResult, MeshSample } from './types';

/** The exact order the synthetic solver imitates, so tests can check the inverse. */
export const SYNTHETIC_TRUE_ORDER = 2;

/**
 * One artefact: the canonical JSON a reader can fetch, and the digest of
 * exactly those bytes.
 *
 * `hashPayload` hashes `canonicalJson`, so storing that same string is what
 * makes the recorded digest checkable rather than merely plausible.
 */
function artefact(name: string, payload: unknown) {
  const content = Buffer.from(canonicalJson(payload), 'utf8');
  return { name, sha256: hashBytes(content), mediaType: 'application/json', content };
}

export const SYNTHETIC_DISCLAIMER =
  'Computed by the synthetic throwaway solver that ships with the prototype. The number is ' +
  'deterministic and internally consistent, but it is not the output of a CFD code and must ' +
  'not be quoted as a physical result.';

const MESH_LEVELS = [
  { level: 'coarse', cells: 250_000 },
  { level: 'medium', cells: 2_000_000 },
  { level: 'fine', cells: 16_000_000 },
] as const;

/**
 * A stand-in "solver" for machines without SU2.
 *
 * It evaluates a smooth analytic function of the mesh size that converges at
 * exactly second order, so the whole verification machinery (three meshes,
 * observed order, Richardson extrapolation, GCI) runs on real code paths and is
 * genuinely tested. Everything it produces is labelled synthetic, and the
 * `method` string it returns says so, so a manuscript built from it cannot pass
 * the claim verifier as a physical result: the evidence record carries
 * `synthetic: true` and the compiler refuses to cite it as measured data.
 */
export function runSyntheticStudy(request: CfdStudyRequest): CfdStudyResult {
  const seed = hashPayload({ quantity: request.quantity, case: request.caseDescription ?? '' });
  const seedValue = Number.parseInt(seed.slice(0, 8), 16) / 0xffffffff; // [0, 1)
  const base = 0.25 + seedValue * 0.5;

  const samples: MeshSample[] = MESH_LEVELS.map((mesh) => {
    const h = (1 / mesh.cells) ** (1 / 3);
    const value = base * (1 + 0.4 * h ** SYNTHETIC_TRUE_ORDER);
    return { level: mesh.level, cells: mesh.cells, value, iterations: 1_200 };
  });

  const study = computeGci(samples);
  const value = study.valid ? study.extrapolatedValue : samples[0]!.value;
  const uncertainty = gciUncertainty(study, value);

  return {
    quantity: request.quantity,
    unit: 'dimensionless',
    solver: 'synthetic',
    study,
    value,
    uncertainty,
    method: `synthetic analytic benchmark (true order ${SYNTHETIC_TRUE_ORDER}), three meshes, Roache GCI`,
    notes: [
      'Synthetic solver: no Navier–Stokes equations were solved.',
      study.valid
        ? `Observed order ${study.apparentOrder.toPrecision(3)} with a fine-grid GCI of ${study.fineGciPercent.toPrecision(3)}%.`
        : `GCI study rejected: ${study.reason ?? 'unknown reason'}.`,
    ],
    disclaimer: SYNTHETIC_DISCLAIMER,
    artefacts: [artefact('mesh-levels.json', samples), artefact('gci-study.json', study)],
  };
}
