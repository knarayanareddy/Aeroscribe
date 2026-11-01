import type { CfdEvidencePayload, GciLevel } from '@aeroscribe/contract';
import type { StageHandler, StageOutcome } from './types';

// The payload shape is the wire contract; re-exported so the stage catalogue
// and the tests keep importing it from the agent that produces it.
export type { CfdEvidencePayload, GciLevel };

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/**
 * Stage 4 — computational evidence.
 *
 * Runs the configured solver and records exactly one result: a value, its GCI
 * uncertainty, the mesh table and the artefact checksums. If the solver cannot
 * run, the stage throws a capability error — it never falls back to a different
 * solver behind the operator's back.
 */
export const evidenceGeneration: StageHandler = async (context): Promise<StageOutcome> => {
  const { cfd, blobs, options, now } = context;

  const result = await cfd.run(
    {
      quantity: options.quantity,
      caseDescription: options.caseDescription,
      // Solver settings (Mach, angle of attack, iterations) belong in the SU2
      // config file the operator points at; the adapter does not invent them.
      meshes: options.meshes,
    },
    { solver: options.solver },
  );

  // Store the bytes the digests describe before recording them. A record that
  // names a hash nobody can fetch is a claim; storing first means the endpoint
  // can always serve what the record says it hashed.
  const artefacts = [];
  for (const artefact of result.artefacts) {
    const stored = await blobs.put(artefact.content, artefact.mediaType);
    if (stored.sha256 !== artefact.sha256) {
      throw new Error(
        `Artefact ${artefact.name} hashed to ${stored.sha256} after being computed as ${artefact.sha256}.`,
      );
    }
    artefacts.push({
      name: artefact.name,
      sha256: stored.sha256,
      bytes: stored.bytes,
      mediaType: stored.mediaType,
    });
  }

  const study = result.study;
  const payload: CfdEvidencePayload = {
    stage: 'evidence-generation',
    schemaVersion: 1,
    quantity: result.quantity,
    unit: result.unit,
    solver: result.solver,
    value: result.value,
    uncertainty: Number.isFinite(result.uncertainty) ? result.uncertainty : 0,
    method: result.method,
    notes: result.notes,
    disclaimer: result.disclaimer,
    gci: study
      ? {
          levels: study.levels.map((level) => ({
            level: level.level,
            cells: level.cells,
            value: level.value,
          })),
          apparentOrder: study.apparentOrder,
          fineGciPercent: finiteOrNull(study.fineGciPercent),
          mediumGciPercent: finiteOrNull(study.mediumGciPercent),
          asymptoticRatio: finiteOrNull(study.asymptoticRatio),
          valid: study.valid,
          reason: study.reason,
        }
      : null,
    artefacts,
    computedAt: now().toISOString(),
  };

  const uncertaintyLabel = Number.isFinite(result.uncertainty)
    ? `±${result.uncertainty.toExponential(2)}`
    : 'uncertainty unavailable';

  return {
    kind: 'cfd-run',
    label: `${result.quantity} — ${result.solver} run`,
    summary: study?.valid
      ? `${result.value.toPrecision(6)} ${uncertaintyLabel} (GCI ${study.fineGciPercent.toPrecision(3)}%, order ${study.apparentOrder.toPrecision(3)}).`
      : `${result.value.toPrecision(6)} with an invalid grid study: ${study?.reason ?? 'no study'}.`,
    payload,
    metrics: {
      solver: result.solver,
      gciValid: study?.valid ? 'yes' : 'no',
      fineGciPercent:
        study && Number.isFinite(study.fineGciPercent)
          ? Number(study.fineGciPercent.toPrecision(3))
          : 'n/a',
      apparentOrder: study ? Number(study.apparentOrder.toPrecision(3)) : 'n/a',
    },
    blocked:
      study && !study.valid
        ? { reason: `The GCI study is not valid: ${study.reason ?? 'unknown reason'}` }
        : undefined,
  };
};
