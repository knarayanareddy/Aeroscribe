# AeroScribe backend — plan, map and operating manual

This is the implementation map for `services/api`. It answers one question for every
part of the backend: **what runs, in what order, where the code is, and what happens
when it fails**. If code and this document disagree, the code is the bug — see
[Keeping this document true](#keeping-this-document-true).

Companion documents: [`specs/architecture.md`](../specs/architecture.md) (system
context), [`specs/pipeline.md`](../specs/pipeline.md) (the nine stages),
[`specs/integrity-rules.md`](../specs/integrity-rules.md) (RULE-001 … RULE-043),
[`docs/IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) (what is real today).

---

## 0. The one rule everything else serves

> Every number in a generated manuscript must be reconstructible from an
> append-only, hash-chained evidence record. If it is not, the manuscript is not
> written — the stage throws and the run stops.

That rule is why this backend is shaped the way it is. It is not a chat wrapper with a
database attached. The registry comes first, the agents are mechanical, and the
flow-control code refuses to skip a human gate.

Three consequences that surprise people reading the code for the first time:

1. **The writer cannot invent numbers, because it is not allowed to type any.** It
   copies numbers out of evidence payloads, formats them at a declared precision, and
   the result is re-verified against the same evidence before the record is appended.
2. **The synthetic CFD solver is not a fallback.** Asking for SU2 without a binary is
   a `503`, not a quiet downgrade. Synthetic results exist so the verification path
   can be exercised end to end — and they block submission at stage 8.
3. **A gate that has not been approved cannot be passed.** `POST /advance` at a
   pending gate is a `409`, always, for every client.

---

## 1. Process layout

```
services/api/src
├── index.ts              buildServer(env) → { app, config, orchestrator }; serve() when run directly
├── config.ts             env parsing, capability probing (detectSu2), describeCapabilities
├── errors.ts             ApiError + 400/401/404/409/422/502/503 constructors
├── orchestrator.ts       run lifecycle, stage dispatch, gate enforcement, audit
├── http/
│   ├── app.ts            Hono routes, CORS, rate limit, bearer auth, error mapping
│   └── rateLimit.ts      fixed-window limiter (60 req/min per key)
├── store/
│   ├── registry.ts       append-only NDJSON hash chain + verify()
│   ├── runs.ts           <runId>.json and <runId>.options.json (atomic writes)
│   └── audit.ts          append-only NDJSON audit trail + read()
├── lib/
│   ├── canonical.ts      canonical JSON + sha256 helpers (stable key order)
│   └── atomic.ts         writeJsonAtomic / readJson
├── literature/
│   ├── types.ts          Paper, SearchReport, DoiVerification, DOI normalisation
│   ├── http.ts           fetchWithRetry (backoff, Retry-After), RequestSpacer
│   ├── crossref.ts       api.crossref.org/works            → Paper
│   ├── arxiv.ts          export.arxiv.org/api/query (Atom) → Paper
│   ├── semanticscholar.ts api.semanticscholar.org/graph/v1 → Paper
│   ├── fixtures.ts       offline corpus (no DOIs, by design)
│   └── index.ts          LiteratureService: fan-out, dedupe, rank, verifyDoi
├── cfd/
│   ├── types.ts          MeshSample, GciStudy, CfdStudyRequest/Result
│   ├── gci.ts            Roache GCI, Richardson extrapolation, validity gates
│   ├── su2.ts            SU2_CFD adapter: spawn, history.csv parsing, study
│   ├── synthetic.ts      deterministic analytic benchmark (always labelled)
│   └── index.ts          CfdService: solver selection, refusal to downgrade
├── claims/
│   ├── extract.ts        numeric tokens, DOI tokens, significant-digit counting
│   └── verify.ts         buildPolicy, verifyClaims (RULE-001, RULE-002)
└── agents/
    ├── types.ts          StageContext, RunOptions, StageOutcome, StageHandler
    ├── research.ts       stage 0 topic, stage 1 literature, stage 2 novelty, stage 3 framing
    ├── evidence.ts       stage 4 CFD evidence
    ├── writing.ts        stage 5 manuscript (claim-verified)
    ├── review.ts         stage 6 review council, stage 7 compliance
    └── knowledge.ts      stage 8 wiki article + submission manifest
```

Build and run:

| Command                            | What it does                                            |
| ---------------------------------- | ------------------------------------------------------- |
| `npm run dev:api`                  | `tsx watch` on `services/api/src/index.ts`              |
| `npm run start:api`                | `tsx` without watch — the deployment entry point        |
| `npm run smoke:cfd`                | synthetic grid study, prints every intermediate number  |
| `npm run smoke:literature`         | live Crossref/arXiv/S2 search + DOI verification        |
| `npx tsc --noEmit -p services/api` | typecheck the service on its own                        |
| `npx vitest run services/api`      | the service test suite (no network, no solver required) |

`buildServer(env)` is the only wiring point. It is exported so tests can build a real
server over a temporary data directory, and `index.ts` only starts listening when the
file is executed directly.

---

## 2. Run lifecycle

```
            createRun
               │
               ▼
      ┌─────────────────┐  advance   ┌──────────────┐  approve   ┌───────────┐
      │ stage running   │───────────▶│ gate_pending │───────────▶│ completed │
      └─────────────────┘            └──────────────┘            └───────────┘
               ▲                            │
               │        requestRevision     │
               └────────────────────────────┘   (revisionCount += 1)

      a handler that throws or reports `blocked` → stage failed, run failed
```

| Transition       | Method                         | Reducer / code                     | Effect                                                       |
| ---------------- | ------------------------------ | ---------------------------------- | ------------------------------------------------------------ |
| create           | `orchestrator.createRun`       | `createRun` in `packages/pipeline` | 9 stages, stage 0 `running`, options persisted               |
| execute stage    | `orchestrator.advance`         | `STAGE_HANDLERS[stage.id]`         | one evidence record, stage → `gate_pending` or `failed`      |
| approve gate     | `orchestrator.approveGate`     | `approveGate` reducer              | stage `completed`, next stage `running`, `currentStage += 1` |
| request revision | `orchestrator.requestRevision` | `requestRevision` reducer          | stage back to `running`, `gateApproved = false`, counter up  |

The reducers live in [`packages/pipeline/src/reducer.ts`](../packages/pipeline/src/reducer.ts)
and are shared with the dashboard, so the server and the UI can never disagree about
what "approving a gate" means. The orchestrator adds exactly four things on top:
persistence, evidence, audit, and the refusal to skip a gate.

Guards, all `409 conflict`:

- `advance` on a stage that is already `gate_pending` (message names the open gate);
- `advance` on a stage that is already `completed`;
- `approveGate` / `requestRevision` when the current stage is not `gate_pending`;
- `approveGate` / `requestRevision` with a `gateId` that is not the open one.

`404` for an unknown run id, `400` for a topic shorter than eight characters.

A **failed** stage can be advanced again: that is the retry path after an operator fixes a
capability (installs SU2, adds an API key). Each attempt appends its own evidence record, so a
retry never overwrites the failure that preceded it — the registry keeps both, and `seq` is the
only ordering that matters.

---

## 3. Stage-by-stage map

Every stage is a `StageHandler` — one function, one evidence record, one gate.

| #   | Stage                     | Handler (file)                                   | Reads                                                                | Writes evidence kind | Gate    |
| --- | ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | -------------------- | ------- |
| 0   | Topic Intelligence        | `topicIntelligence` (`agents/research.ts`)       | `run.topic`, `run.journal`                                           | `stage-output`       | GATE-0  |
| 1   | Literature Archaeology    | `literatureArchaeology` (`agents/research.ts`)   | providers, `options.paperLimit`, `options.verifyTop`                 | `literature-search`  | GATE-1  |
| 2   | Novelty Detection         | `noveltyDetection` (`agents/research.ts`)        | latest `literature-search`                                           | `novelty-report`     | GATE-2  |
| 3   | Contribution Framing      | `contributionFraming` (`agents/research.ts`)     | latest `novelty-report`, latest `stage-output`                       | `stage-output`       | GATE-3  |
| 4   | Evidence Generation (CFD) | `evidenceGeneration` (`agents/evidence.ts`)      | `CfdService`, `options.solver/quantity/meshes`                       | `cfd-run`            | GATE-4A |
| 5   | Paper Synthesis           | `paperSynthesis` (`agents/writing.ts`)           | all prior records                                                    | `manuscript`         | GATE-5  |
| 6   | Peer Review Council       | `peerReview` (`agents/review.ts`)                | `manuscript`, `cfd-run`                                              | `review-report`      | GATE-6  |
| 7   | Revision & Compliance     | `complianceCheck` (`agents/review.ts`)           | `manuscript`, `review-report`, journal profile                       | `compliance-report`  | GATE-7  |
| 8   | AeroWiki & Submission     | `knowledgeAndSubmission` (`agents/knowledge.ts`) | `manuscript`, `review-report`, `compliance-report`, `novelty-report` | `submission-package` | GATE-8  |

`STAGE_HANDLERS` in `orchestrator.ts` is an array indexed by stage id, so adding a
stage means changing `PIPELINE_STAGES` **and** that array — and the type system plus
`packages/pipeline/src/stages.test.ts` will catch the omission.

### Stage 0 — Topic Intelligence

Tokenises the topic, scores each journal profile's scope keywords, picks a target and
records the numbers it used. Deterministic; no model call. If the topic shares no
scope keyword with any profile the fit is honestly `0`, not a made-up relevance.

Payload: `targetJournal`, `journalId`, `keywordFit`, `matchedKeywords`,
`unmatchedKeywords`, **`topicNumbers`** (numbers that are part of the research
question, e.g. "Mach 0.78", declared so the claim verifier treats them as given).

### Stage 1 — Literature Archaeology

`LiteratureService.search()` fans out across the configured providers, dedupes by DOI
and normalised title, and ranks (DOI present → citation count → recency). The top
`options.verifyTop` hits are then DOI-resolved. **Only resolved hits enter
`references`**; everything else lands in `rejected` with a reason, and provider errors
land in `providerErrors`. Offline mode returns fixture papers with `doi: null`, so
they are always rejected — offline runs can never cite anything.

### Stage 2 — Novelty Detection

Compares topic terms against the verified abstracts. `confidence` is `supported` only
with ≥3 verified references; otherwise `insufficient-evidence` with a note saying how
many are missing. A term nobody published on is a _candidate gap_, not a novelty
score.

### Stage 3 — Contribution Framing

Builds one sentence from the stage-0 journal target and the stage-2 gaps, and records
`evidenceBasis: { verifiedReferences, gaps }`. It reads only records that already
exist — no new claims.

### Stage 4 — Evidence Generation (CFD)

`CfdService.run()` picks the solver explicitly:

| Requested solver | Binary available | Result                                                  |
| ---------------- | ---------------- | ------------------------------------------------------- |
| `su2`            | yes              | three SU2 runs → `history.csv` → GCI study              |
| `su2`            | no               | `503 capability_unavailable`, names `SU2_CFD_BINARY`    |
| `synthetic`      | —                | analytic benchmark, `disclaimer` set, `synthetic: true` |

The record carries `value`, `uncertainty`, `method`, `notes`, `disclaimer`, the mesh
table with cell counts, `gci.valid/reason`, and artefact checksums. If the GCI study
is invalid the stage returns `blocked`, which marks the stage failed — a value without
a defensible interval is not promoted to a result.

### Stage 5 — Paper Synthesis

Reads every prior record, formats numbers at a declared precision
(`formatMeasurement`), assembles Introduction / Method / Results / Discussion /
Conclusion / **AI use disclosure**, then runs the whole text — title, abstract,
sections, reference list — through `verifyClaims`. One unbacked number or one
unresolved DOI throws `UnverifiableClaimError` (422) and no manuscript record is
written.

### Stage 6 — Peer Review Council

Six explicit checks, each with a rule id: RULE-001 (numbers trace), RULE-002 (DOIs
resolve), journal abstract length, ≥3 references, RULE-004 (disclosure present),
RULE-041 (valid GCI). Any _major_ comment makes the verdict `revise`. Synthetic
results always produce a major comment.

### Stage 7 — Revision & Compliance

Journal profile checks: abstract length, required sections, numbered citations, and a
blocking `review-verdict` issue when the council asked for revisions.

### Stage 8 — AeroWiki & Submission

Compiles a markdown wiki article from the manuscript and builds a submission
**manifest** — file names and SHA-256 of payloads. It is explicitly not a PDF, not a
`.docx`, and nothing is uploaded to a journal. The stage returns `blocked` when the
review did not pass, compliance is not met, or the numbers are synthetic, which marks
the run failed: a prototype must not be able to "submit" itself.

---

## 4. Evidence registry

`store/registry.ts`, one NDJSON line per record, append-only.

```jsonc
{
  "seq": 4,
  "id": "0b1f…",                 // uuid
  "kind": "cfd-run",
  "runId": "run-…",
  "stageId": 4,
  "label": "drag coefficient — synthetic run",
  "createdAt": "2026-10-30T10:00:00.000Z",
  "payloadHash": "sha256(canonicalJson(payload))",
  "prevHash": "…",               // hash of record seq-1, or GENESIS (64 zeros)
  "payload": { … },
  "hash": "sha256(canonicalJson({seq,id,kind,runId,stageId,label,createdAt,payloadHash,prevHash}))"
}
```

Properties:

- **Canonical hashing** — `lib/canonical.ts` sorts object keys recursively, so the
  same payload hashes the same in any process, on any machine.
- **Chain, not per-record hash** — `prevHash` is covered by `hash`, so editing,
  deleting, reordering or inserting a record breaks verification at that point.
- **`verify()`** re-reads the file from disk (not from memory) and returns
  `{ valid, records, head, brokenAt?, reason? }`. Reasons distinguish an edited
  payload, edited metadata, a gap in `seq`, and a hash mismatch.
- **Serialised appends** — writes queue behind a promise chain, so 20 concurrent
  appends still produce `seq` 0…19 in order.
- **One record per stage** — the orchestrator appends exactly one record per executed
  stage. Nothing else in the system writes to the registry.

The registry is the source of the `evidenceSeq` shown on every stage of the dashboard
and the reason `GET /api/v1/evidence/verify` can exist as a cheap integrity probe.

---

## 5. Claims verification (RULE-001, RULE-002)

`claims/extract.ts` extracts _every_ number it can see and lets the verifier decide
what counts as a claim — filtering at extraction time is how fabricated values escape.

Accepted without evidence:

| Shape                                     | Why                                         |
| ----------------------------------------- | ------------------------------------------- |
| `Figure 3`, `Section 2`, `Table 4`, `[7]` | structural references, not measurements     |
| `Ref. 12`, `Eq. 4`                        | same                                        |
| a year inside brackets, e.g. `(2024)`     | reference-list year, validated by DOI check |
| DOI-shaped strings                        | checked separately against this run's DOIs  |

Everything else must satisfy one of:

1. **exact-ish match** of an evidence number (relative tolerance `1e-6`, floor `1e-9`);
2. **correct rounding** of an evidence number at the precision the author printed —
   `0.4264` is accepted for a stored `0.42639127…`, `0.43` is not; at least two
   significant digits are required, so `0.4` cannot be used to claim `0.4264`;
3. **declared derived count** — `verifiedReferences`, `gaps`, `meshCount` are passed to
   `buildPolicy` with the expression they came from, so "3 meshes" is a count of
   evidence, not a measurement.

DOIs found in the text are masked before number extraction (a DOI contains digits that
are not claims) and must appear in the run's verified DOI set, otherwise the report
gets a `RULE-002` violation.

`verifyClaims` returns `{ ok, checked, unbacked[], allowedDois[], observedDois[] }`.
`unbacked[]` items carry the token, the value, a ±40-character context and the reason —
enough to fix the sentence without opening a debugger.

---

## 6. Literature integration

| Provider         | Endpoint                                                | Notes                                                                                |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Crossref         | `https://api.crossref.org/works`                        | `mailto` from `AEROSCRIBE_CONTACT_EMAIL` (polite pool), JATS stripped from abstracts |
| arXiv            | `https://export.arxiv.org/api/query`                    | Atom feed parsed without a dependency, `all:` query                                  |
| Semantic Scholar | `https://api.semanticscholar.org/graph/v1/paper/search` | Optional `x-api-key` from `SEMANTIC_SCHOLAR_API_KEY` (server-side only)              |

Shared HTTP policy (`literature/http.ts`):

- **Backoff** — attempt 1 immediate, then 2 s, 4 s, 8 s, 16 s, capped at 30 s; honours
  `Retry-After` (seconds or HTTP date). RULE-042.
- **Retryable statuses** — 408, 425, 429, 500, 502, 503, 504. A 404 or 422 is _not_
  retried; it is information.
- **Timeouts** — per-attempt timeout and a per-provider deadline
  (`AEROSCRIBE_UPSTREAM_TIMEOUT_MS`). A provider that hangs is reported as
  `provider timed out after 20000ms`, never as "the caller aborted".
- **Politeness** — `RequestSpacer` serialises calls per host (Crossref 1 s, arXiv 3 s,
  S2 1.1 s without a key, 200 ms with one).
- **Error surface** — failures are collected per provider into `SearchReport.errors`.
  A run that lost Crossref can say exactly that; nothing is silently dropped.

`verifyDoi` requires a registry response with a non-empty title and a plausible year;
a well-formed string is never "verified". In offline mode it returns
`verified: false, reason: 'offline mode: no registry reachable…'`.

The offline corpus (`literature/fixtures.ts`) exists so tests and demos never touch the
network. **Every fixture paper has `doi: null` by design**, which is what makes an
offline run unable to cite anything.

---

## 7. CFD integration and grid-convergence verification

### 7.1 Real solver (SU2)

```
SU2_CFD_BINARY=/opt/su2/bin/SU2_CFD
POST /api/v1/runs  { "options": { "solver": "su2" } }   # meshes come from RunOptions.meshes
```

Contract of `runSu2Study` (`cfd/su2.ts`):

1. one config file per mesh level (`opt/mesh:level:cells:path`), three levels required;
2. each run executes `SU2_CFD <config>` in its own `study-<uuid>/` directory, so
   concurrent studies cannot read each other's `history.csv`;
3. the last finite value of the requested column (`options.quantity`, e.g. `CD`) is
   read from `history.csv`;
4. the file is hashed and recorded as an artefact;
5. any non-zero exit, missing `history.csv` or missing column **aborts** the study with
   the level that failed — a partial set is never turned into a grid study.

The adapter does not generate SU2 configs. Mesh generation and solver configuration are
engineering decisions; inventing them silently would be worse than requiring them.

### 7.2 Synthetic benchmark

`cfd/synthetic.ts` evaluates `base · (1 + 0.4 · h²)` on three mesh sizes, where `h` is
the mean cell size, so the observed order is exactly 2 and the extrapolation inverts
correctly. It exists to exercise the verification path, is seeded from the quantity and
case description (deterministic), and every artefact says
`synthetic analytic benchmark`. `CfdService` only returns it when the caller asked for
it or when no solver was requested at all — and then `disclaimer` is set, the manuscript
is marked `synthetic: true`, the review verdict is `revise`, and stage 8 blocks.

### 7.3 GCI procedure and acceptance criteria

Roache/ASME V&V 20, three grids, `r = (N_fine/N_coarse)^(1/3)`:

1. sort by cell count, fine → coarse;
2. `r21 = (N1/N2)^(1/3)`, `r32 = (N2/N3)^(1/3)`;
3. `p = [ln|Δ32/Δ21| + ln((r21^p − s)/(r32^p − s))] / ln r21`, solved by fixed point,
   `s = sign(Δ32/Δ21)` (`s = +1` monotone, `s = −1` oscillatory);
4. `f_exact = f1 + (f1 − f2)/(r21^p − 1)`;
5. `GCI_fine = 1.25 · |(f2 − f1)/f1| / (r21^p − 1) · 100 %`.

A study is **valid** only when _all_ of these hold:

| Check                                                        | Reject reason when false                              |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| exactly three levels, distinct positive cell counts          | names the structural problem                          |
| values finite and not all identical                          | "the quantity does not depend on the grid"            |
| monotone convergence                                         | "values oscillate with mesh refinement…"              |
| `p` settles inside [0.5, 10]                                 | "the apparent order did not settle inside [0.5, 10]…" |
| asymptotic ratio `GCI_medium/(r^p·GCI_fine)` in [0.85, 1.15] | "the grids are not in the asymptotic range (…)…"      |
| `0 ≤ GCI_fine < 100 %`                                       | interval is not an interval                           |

The asymptotic check is the one people forget: a converged `p` with a GCI ratio of
0.0004 means the two grids disagree, and quoting either interval would be false
confidence. `docs/BACKEND.md` records the band because it is a policy choice: 10 % is
the ASME suggestion, 15 % is used here because three grids is the minimum to estimate
`p` at all.

---

## 8. HTTP API

Base path `/api/v1`. Authentication applies to `/api/v1/*` when `AEROSCRIBE_API_KEY` is
set (`Authorization: Bearer <key>`); `/health` is always open. Errors are always
`{ "error": { "code", "message", "details? } }`.

| Method | Path                                     | Purpose                                    |
| ------ | ---------------------------------------- | ------------------------------------------ |
| GET    | `/health`                                | liveness + capabilities + `authRequired`   |
| GET    | `/api/v1/capabilities`                   | literature mode, SU2 availability, storage |
| GET    | `/api/v1/runs`                           | list runs, newest first                    |
| POST   | `/api/v1/runs`                           | create a run (`topic` ≥ 8 chars)           |
| GET    | `/api/v1/runs/:id`                       | one run                                    |
| POST   | `/api/v1/runs/:id/advance`               | execute the current stage                  |
| POST   | `/api/v1/runs/:id/gates/:gateId/approve` | approve the open gate                      |
| POST   | `/api/v1/runs/:id/gates/:gateId/reject`  | send the stage back for revision (`note`)  |
| GET    | `/api/v1/runs/:id/evidence?kind=`        | registry records for the run               |
| GET    | `/api/v1/evidence/verify`                | re-hash the whole chain from disk          |
| GET    | `/api/v1/audit?runId=&limit=`            | audit trail (read-only)                    |
| GET    | `/api/v1/literature/search?q=&limit=`    | live/offline search                        |
| POST   | `/api/v1/literature/verify-doi`          | `{ doi, expectedTitle? }` → 200 or 422     |
| POST   | `/api/v1/claims/verify`                  | `{ text, runId }` → claim report           |

Status codes used: `200`, `201`, `400` invalid request, `401` missing/wrong key, `404`
unknown run or route, `409` gate discipline, `422` DOI did not resolve /
unverifiable claim, `429` rate limited, `502` upstream failed after retries, `503`
capability unavailable (e.g. SU2).

Example — the full loop for one stage:

```bash
curl -s localhost:8787/api/v1/runs -H 'content-type: application/json' \
  -d '{"topic":"transonic wing drag prediction","options":{"solver":"synthetic"}}'
curl -s -X POST localhost:8787/api/v1/runs/run-1/advance -d '{"actor":"ana"}'
curl -s -X POST localhost:8787/api/v1/runs/run-1/gates/GATE-0/approve -d '{"actor":"reviewer"}'
curl -s 'localhost:8787/api/v1/runs/run-1/evidence?kind=stage-output'
curl -s localhost:8787/api/v1/evidence/verify
```

---

## 9. Configuration

| Variable                         | Default                                       | Meaning                                                            |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `HOST`                           | `127.0.0.1`                                   | bind address (use `0.0.0.0` in a container)                        |
| `PORT`                           | `8787`                                        | bind port                                                          |
| `AEROSCRIBE_DATA_DIR`            | `./data`                                      | registry, runs, audit, CFD studies                                 |
| `AEROSCRIBE_API_KEY`             | _unset_                                       | unset ⇒ **no authentication**; `/health` says `authRequired:false` |
| `AEROSCRIBE_CONTACT_EMAIL`       | _unset_                                       | Crossref polite-pool `mailto`                                      |
| `AEROSCRIBE_OFFLINE`             | `false`                                       | `true` ⇒ fixture corpus, no network                                |
| `SU2_CFD_BINARY`                 | _unset_                                       | absolute path; availability is probed, not assumed                 |
| `AEROSCRIBE_CORS_ORIGINS`        | `http://localhost:5173,http://localhost:5174` | comma-separated allowlist                                          |
| `AEROSCRIBE_UPSTREAM_TIMEOUT_MS` | `15000`                                       | per-attempt and per-provider deadline                              |
| `AEROSCRIBE_RETRY_BASE_MS`       | `2000`                                        | first backoff step (RULE-042)                                      |
| `SEMANTIC_SCHOLAR_API_KEY`       | _unset_                                       | server-side only; never sent to the browser                        |

Data layout under `AEROSCRIBE_DATA_DIR`:

```
registry.ndjson          append-only evidence chain (never rewritten)
audit.ndjson             append-only audit trail
runs/<runId>.json        run state (atomic replace)
runs/<runId>.options.json run options (survive restarts)
cfd/study-<uuid>/        SU2 working directories: history.csv per mesh level
```

---

## 10. Failure modes

| Symptom                                | What the backend does                                                           | What the client sees                                     |
| -------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Crossref/arXiv/S2 unreachable or slow  | retries with backoff, then reports per provider                                 | `SearchReport.errors`, honest count of hits              |
| Every provider down, live mode         | stage 1 still completes with `references: []` and `providerErrors`              | review verdict `revise`, submission blocked              |
| `solver: "su2"` without a binary       | refuses; no silent fallback                                                     | `503 capability_unavailable` naming the env var          |
| SU2 exits non-zero / no `history.csv`  | aborts the study naming the mesh level                                          | `502 upstream_error` with stderr tail                    |
| GCI study not asymptotic               | stage 4 returns `blocked`                                                       | stage `failed`, `blocked.reason` in the advance response |
| Author prints a number not in evidence | `paperSynthesis` throws before appending                                        | `422 unverifiable_claim` with the offending tokens       |
| DOI in text was never verified         | verification fails with `RULE-002`                                              | `422`, DOI listed                                        |
| Advance at an unapproved gate          | refused                                                                         | `409 conflict` naming the gate                           |
| Registry tampered with on disk         | `verify()` reports `brokenAt` and the reason                                    | `GET /evidence/verify` → `valid:false`                   |
| API key unset                          | runs unauthenticated and says so                                                | `/health` → `authRequired:false`                         |
| Too many requests                      | fixed-window limiter per key/IP                                                 | `429 rate_limited` + `x-ratelimit-remaining`             |
| Process restarts mid-run               | run state and options reload from disk; a `running` stage can be advanced again | run continues, evidence chain intact                     |

Deliberate non-fallback: there is no "try SU2, else synthetic" path anywhere in the
code, and no "use the cache if the network fails" path in live mode. Both would make a
run look successful while its numbers were not what the operator asked for.

---

## 11. Integrity rules → code

| Rule     | Meaning                                     | Where it is enforced                                           |
| -------- | ------------------------------------------- | -------------------------------------------------------------- |
| RULE-001 | every number traces to a record             | `claims/verify.ts` → stage 5 throws, stage 6 check `RULE-001`  |
| RULE-002 | every DOI resolved for this run             | `literature/index.ts` `verifyDoi`, `claims/verify.ts`, stage 6 |
| RULE-004 | AI use disclosure present                   | `agents/writing.ts` section, stage 6 check `RULE-004`          |
| RULE-013 | rate limiting                               | `http/rateLimit.ts` (60/min default)                           |
| RULE-041 | checksums for computed artefacts; valid GCI | `store/registry.ts` hash chain, `cfd/gci.ts` validity gates    |
| RULE-042 | retry with exponential backoff              | `literature/http.ts` `backoffDelay` / `fetchWithRetry`         |
| RULE-043 | append-only evidence                        | `store/registry.ts` (no update/delete API exists), `verify()`  |

---

## 12. Tests

| File                        | Covers                                                                         |
| --------------------------- | ------------------------------------------------------------------------------ |
| `test/canonical.test.ts`    | canonical JSON, key ordering, hash stability                                   |
| `test/registry.test.ts`     | chain integrity, tamper detection, concurrent appends                          |
| `test/retry.test.ts`        | backoff schedule, `Retry-After`, timeout vs abort vs DNS messages, spacer      |
| `test/gci.test.ts`          | order recovery, extrapolation, oscillatory and non-asymptotic rejection        |
| `test/literature.test.ts`   | provider mapping, JATS stripping, dedupe/rank, DOI verification, offline rules |
| `test/su2.test.ts`          | `history.csv` parsing, fake-binary study, failure paths                        |
| `test/cfd-service.test.ts`  | solver selection, capability refusal, synthetic labelling                      |
| `test/claims.test.ts`       | extraction, precision rules, derived counts, DOI masking                       |
| `test/agents.test.ts`       | stages 0–3 payloads, stage 5 refusal, stage 6 verdict                          |
| `test/orchestrator.test.ts` | full 9-stage run, gate discipline, revision loop, restart durability           |
| `test/http.test.ts`         | auth on/off, rate limit, error shapes, CORS, every route                       |

The suite is hermetic: no network, no solver, temporary data directories, and fake
binaries written into `os.tmpdir()`. `npm run smoke:*` is the by-hand equivalent that
_does_ touch the outside world, on purpose.

---

## 13. Deliberately not built

| Not built                        | Why, and what would be needed                                        |
| -------------------------------- | -------------------------------------------------------------------- |
| LaTeX/PDF compilation            | needs a TeX toolchain and publisher templates; the manifest says so  |
| Journal submission               | credentials per publisher, and a human who takes responsibility      |
| LLM-written prose                | RULE-001 is easier to guarantee when the writer is mechanical        |
| Multi-tenant auth, user accounts | single bearer token today; per-user data would need a real IdP       |
| Distributed rate limiting        | the limiter is per process; a shared store would fix it              |
| Job queue / background workers   | `advance` is synchronous per stage; long SU2 runs would need a queue |
| Cross-process registry locking   | one writer process is assumed; a lock file or DB would be needed     |
| Retraction / record deletion     | append-only by design; corrections are new records                   |

---

## 14. Operating checklist

Before exposing the API anywhere:

1. `AEROSCRIBE_API_KEY` set to a long random value — `/health` must report
   `authRequired: true`.
2. `AEROSCRIBE_CONTACT_EMAIL` set, so Crossref can reach you instead of rate-limiting
   you silently.
3. `AEROSCRIBE_DATA_DIR` on a persistent volume with backups — the registry is the
   audit trail.
4. `HOST=0.0.0.0` only inside a container/private network, with TLS in front.
5. `POST /api/v1/evidence/verify` in the deploy smoke test: `valid: true`.
6. `npm run smoke:cfd` on the host — it proves whether `SU2_CFD_BINARY` is usable.
7. `npm run smoke:literature -- "your topic"` — it proves the providers are reachable
   and that DOIs actually resolve from that network.

---

## Keeping this document true

Each section maps to a file that can be read in one sitting. When a change makes a
statement here false, update the statement in the same commit — the review process
treats a stale backend document as a bug, because this file is what an operator trusts
at 3 a.m.
