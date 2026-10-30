# Pipeline, stages and gates

The catalogue lives in `packages/pipeline/src/stages.ts`; the fixture runs that exercise the UI
live in `apps/dashboard/src/data/mockData.ts`. Both are illustrative, not the output of a real
pipeline.

## Nine stages

| #   | Stage                     | Agents (fixtures)                                                         | Gate(s)                   |
| --- | ------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| 0   | Topic Intelligence        | `TopicIntelligenceAgent`                                                  | GATE-0                    |
| 1   | Literature Archaeology    | `LiteratureHarvestAgent`, `CitationGraphAgent`, `LiteratureRerankerAgent` | GATE-1                    |
| 2   | Novelty Detection         | `NoveltyDetectionAgent`                                                   | GATE-2                    |
| 3   | Contribution Framing      | —                                                                         | GATE-3                    |
| 4   | Evidence Generation (CFD) | `CFDSetupAgent`, `CFDSolverAgent`                                         | GATE-4A, GATE-4B, GATE-4C |
| 5   | Paper Synthesis           | —                                                                         | GATE-5                    |
| 6   | Peer Review Council       | —                                                                         | GATE-6                    |
| 7   | Revision & Compliance     | —                                                                         | GATE-7                    |
| 8   | AeroWiki & Submission     | —                                                                         | GATE-8                    |

The specification defines **eleven human checkpoints across nine stages**: stage 4 splits into
three gates (mesh convergence, experimental validation, final figure set). This is not a
contradiction to be explained away — it is encoded in `packages/pipeline/src/stages.ts`:
every stage has a `gateIds` array (stage 4 has three entries) and
`GATE_CHECKPOINT_COUNT` is derived from it, so the landing page, the dashboard and the tests
cannot drift apart. The prototype's `StageInfo.gateId` holds the _first_ checkpoint of its
stage, which is why the dashboard shows `GATE-4A` for stage 4; `GATE-4B` and `GATE-4C` exist
only in the specification.

> Note: the archived design draft's RULE-003 lists gate stages as "0, 3, 4a, 4b, 4c, 6, 7",
> which contradicts its own gate table (GATE-0 … GATE-8, with 4A/4B/4C). The table above follows
> the gate table and the fixture data.

## Run state machine

`PipelineStatus`: `idle` → `running` → `gate_pending` → `completed`, with `failed` as the error
state. Each `StageInfo` has its own `StageStatus`: `pending`, `running`, `gate_pending`,
`completed`, `failed`, `skipped`.

Reducer actions (`packages/pipeline/src/reducer.ts`):

| Action            | Behaviour                                                                                                             | Invariants                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createRun`       | Prepends the new run and selects it.                                                                                  | Nine stages, all `pending`; `currentStage: 0`.                                                                         |
| `selectRun`       | Changes `activeRunId` if the id exists.                                                                               | Unknown ids are ignored, never crash.                                                                                  |
| `approveGate`     | Marks the stage `completed` + `gateApproved`, starts the next `pending` stage, advances `currentStage`.               | Only acts on a stage whose status is `gate_pending`; never mutates the input run; no-op when the stage does not exist. |
| `requestRevision` | Re-runs the stage: status back to `running`, increments `revisionCount`, clears `gateApproved`, keeps `currentStage`. | Only acts on `gate_pending`; the gate must be re-passed later.                                                         |

The last stage approval marks the run `completed`. A run with an open gate has
`status: 'gate_pending'`, which is what the dashboard banner keys on.

## Why this is a package, not app code

The dashboard needs the stage catalogue, the reducer, derived statistics and formatting. The
landing page needs the stage list and gate ids for its "how it works" section. Keeping these in
`@aeroscribe/pipeline` means the two apps can never disagree about stage names, gate ids or
progress maths — a problem the previous code had in three separate copies.

## Extending the pipeline

1. Add the stage (or gate) to `packages/pipeline/src/stages.ts`.
2. Update `apps/dashboard/src/data/mockData.ts` fixtures if the UI should show them.
3. Update the table above and the gate list in `specs/integrity-rules.md` if semantics change.
4. Run `npm test`; `packages/pipeline/src/reducer.test.ts` covers gate transitions and
   immutability.
