# ADR-0001 — The manuscript writer is deterministic, and RULE-022 is N/A

- **Status:** accepted (2026-10-31)
- **Deciders:** whoever maintains `services/api/src/agents`
- **Affects:** RULE-001, RULE-022, `services/api/src/agents/writing.ts`

## Context

`specs/integrity-rules.md` RULE-022 requires per-invocation agent telemetry: tokens consumed, cost,
model identifier, latency, and a prompt/log-provenance record. The enforcement table marks it
**N/A**, with the reason "no model calls: every stage handler is deterministic, so there are no
tokens or costs to log".

That is true today, and it is the reason RULE-001 ("no fabricated numbers") can be enforced
exactly. But "N/A" is a statement about the current code, not a permanent decision, and a table
that says N/A without saying _why_ invites two failure modes: someone adds a model SDK and
RULE-022 silently becomes false, or someone builds token accounting for calls that do not exist.

## Decision

1. **No model client is used to produce text or numbers.** Stage 5 assembles the manuscript from
   records: measured values are rounded from evidence, the abstract is templated, references are
   rendered from `ReferenceRecord`s. Every sentence that carries a number can be traced to the
   record it came from, which is what lets `verifyClaims` reject anything else.
2. **RULE-022 stays N/A** while that holds. Building token/cost plumbing now would be telemetry
   for a call graph that does not exist — a fabricated feature, in the same class as a fabricated
   result.
3. **A guard keeps the claim honest.** `services/api/test/integrity.test.ts` fails if a known
   model SDK appears in any workspace's `package.json`. Adding one is therefore a deliberate act
   with a paper trail, not a dependency bump nobody noticed.

## What would have to happen to use a model

If a future change introduces model-generated prose, RULE-022 becomes **Not met** on the same
commit, and the following must land with it:

1. A stage `RunOptions` field and an evidence record entry naming the model, its version/date and
   the exact prompt hash — so a manuscript can be regenerated from the registry alone.
2. Per-invocation telemetry: input/output tokens, cost in a stated currency, latency, and the
   provider request id. Cached and streamed calls count.
3. `schemaVersion` bump on `manuscript`, because the payload semantics change from "derived" to
   "generated".
4. A rule-level review: RULE-001 must still hold. The cheapest way to keep it is to constrain the
   model to _rephrase_ around numbers the writer already produced, and to run `verifyClaims` on
   the model's output exactly as on the template's. If that is not achievable, the answer is not
   to weaken the verifier.

## Consequences

- **Positive:** the claim "every number in the draft traces to the registry" is mechanically true,
  and the code that proves it is small enough to read.
- **Positive:** no cost, latency or rate-limit surface in the pipeline, and no prompt-injection
  surface in the writing stage.
- **Negative:** the prose is plain. It will not read like a human wrote it, and it will not adapt
  its tone to a journal. That is a stated limitation, not a defect to hide.
- **Risk:** the guard is a denylist. A new SDK under an unfamiliar name would pass. The mitigation
  is review, not cleverness: a PR that adds an HTTP client to a model provider will be seen, and
  this ADR is the checklist it gets reviewed against.
