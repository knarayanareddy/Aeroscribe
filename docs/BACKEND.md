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
│   ├── ports.ts          RunStore, EvidenceStore, AuditStore interfaces
│   ├── index.ts          createStores(): the only place an adapter is chosen
│   ├── evidence.ts       append-only NDJSON hash chain + verify()
│   ├── runs.ts           <runId>.json and <runId>.options.json (atomic writes)
│   └── audit.ts          append-only NDJSON audit trail + read()
├── lib/
│   ├── canonical.ts      canonical JSON + sha256 helpers (stable key order)
│   ├── atomic.ts         writeJsonAtomic / readJson
│   ├── logger.ts         JSON-lines logger with key and value redaction
│   ├── requestContext.ts AsyncLocalStorage scope: request_id, run_id, subject
│   └── shutdown.ts       SIGTERM drain with a deadline
├── literature/
│   ├── types.ts          Paper, SearchReport, DoiVerification, DOI normalisation
│   ├── http.ts           fetchWithRetry (backoff, Retry-After), RequestSpacer
│   ├── crossref.ts       api.crossref.org/works            → Paper
│   ├── arxiv.ts          export.arxiv.org/api/query (Atom) → Paper
│   ├── semanticscholar.ts api.semanticscholar.org/graph/v1 → Paper
│   ├── fixtures.ts       offline corpus (no DOIs, by design)
│   ├── reference.ts      ReferenceRecord: structured, timestamped references
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
    ├── writing.ts        stage 5 plan record, then the manuscript (claim-verified)
    ├── plan.ts           buildPlan / renderPlan / checkProjection (RULE-030)
    ├── citation.ts       AIAA forms, their inverse, and the round-trip check (RULE-032)
    ├── review.ts         stage 6 review council, stage 7 compliance
    └── knowledge.ts      stage 8 wiki article, LaTeX render, submission manifest
```

The renderer sits outside `agents/` because it is a document builder, not a stage:

```
services/api/src/latex/
├── escape.ts       escapeLatex (one pass over code points) + stripLatex (prose out)
├── bibliography.ts BibTeX from ReferenceRecord; absent fields are omitted, not filled
├── figures.ts      pgfplots two-panel figure + .dat from the cfd-run mesh study
├── render.ts       renderManuscript → deterministic .tex/.bib/figure files
├── toolchain.ts    probeLatex: `--version`, bounded, never throws
├── compile.ts      two passes, -halt-on-error, log tail on failure
└── index.ts        LatexService: render always, compile when a toolchain answered
```

Build and run:

| Command                            | What it does                                            |
| ---------------------------------- | ------------------------------------------------------- |
| `npm run dev:api`                  | `tsx watch` on `services/api/src/index.ts`              |
| `npm run start:api`                | `tsx` without watch — the deployment entry point        |
| `npm run smoke:cfd`                | synthetic grid study, prints every intermediate number  |
| `npm run smoke:literature`         | live Crossref/arXiv/S2 search + DOI verification        |
| `npm run recheck -- --all`         | re-resolve stored DOIs for every run (cron entry point) |
| `npm run smoke:latex`              | render a manuscript, and compile it when TeX is present |
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
- `advance` while this run already has a stage in flight — a double click, or a retried
  request, would otherwise spawn a second SU2 study and append a second evidence record;
- `approveGate` / `requestRevision` when the current stage is not `gate_pending`;
- `approveGate` / `requestRevision` with a `gateId` that is not the open one.

`404` for an unknown run id, `400` for a topic shorter than eight or longer than 300
characters, `413` for a body over 1 MiB.

The in-flight guard is per process, like the rate limiter: two instances sharing a data
directory would not see each other's running stages. The registry assumes a single writer for
the same reason (see § 13).

A stage that is only _recorded_ as `running` — the process died mid-stage — is resumed by the
next `advance`, because the in-flight set is empty in the new process. Nothing is guessed: the
handler re-runs and appends a fresh record.

A **failed** stage can be advanced again: that is the retry path after an operator fixes a
capability (installs SU2, adds an API key). Each attempt appends its own evidence record, so a
retry never overwrites the failure that preceded it — the registry keeps both, and `seq` is the
only ordering that matters.

---

## 3. Stage-by-stage map

Every stage is a `StageHandler` — one function, one evidence record, one gate.

| #   | Stage                     | Handler (file)                                   | Reads                                                                | Writes evidence kind                      | Gate    |
| --- | ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- | ------- |
| 0   | Topic Intelligence        | `topicIntelligence` (`agents/research.ts`)       | `run.topic`, `run.journal`                                           | `stage-output`                            | GATE-0  |
| 1   | Literature Archaeology    | `literatureArchaeology` (`agents/research.ts`)   | providers, `options.paperLimit`, `options.verifyTop`                 | `literature-search`                       | GATE-1  |
| 2   | Novelty Detection         | `noveltyDetection` (`agents/research.ts`)        | latest `literature-search`                                           | `novelty-report`                          | GATE-2  |
| 3   | Contribution Framing      | `contributionFraming` (`agents/research.ts`)     | latest `novelty-report`, latest `stage-output`                       | `stage-output`                            | GATE-3  |
| 4   | Evidence Generation (CFD) | `evidenceGeneration` (`agents/evidence.ts`)      | `CfdService`, `options.solver/quantity/meshes`                       | `cfd-run`                                 | GATE-4A |
| 5   | Paper Synthesis           | `paperSynthesis` (`agents/writing.ts`)           | all prior records                                                    | `manuscript-plan`, then `manuscript`      | GATE-5  |
| 6   | Peer Review Council       | `peerReview` (`agents/review.ts`)                | `manuscript`, `manuscript-plan`, `cfd-run`                           | `review-report`                           | GATE-6  |
| 7   | Revision & Compliance     | `complianceCheck` (`agents/review.ts`)           | `manuscript`, `review-report`, journal profile                       | `compliance-report`                       | GATE-7  |
| 8   | AeroWiki & Submission     | `knowledgeAndSubmission` (`agents/knowledge.ts`) | `manuscript`, `review-report`, `compliance-report`, `novelty-report` | `submission-package`, `manuscript-render` | GATE-8  |

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

Stage 5 writes **two** records, in this order: a `manuscript-plan` and then the
`manuscript` that names it. The text is a projection of the plan, not a parallel
production of it.

**The plan (`agents/plan.ts`).** `buildPlan` is a pure function of the records the run
already holds: sections follow `journal.sectionOrder` (plus the mandatory AI use
disclosure), and each paragraph carries `id` (`p-<section>-<n>`), `intent`,
`evidenceRefs` (`<kind>#<seq>`), `numberKeys` and `targetWords`. There is **no language
model** in this path — the hierarchy is an artefact, which is what makes it checkable.
This is deliberately _not_ an LLM outline: nothing is inferred, and the same evidence
rebuilds the same plan byte for byte.

**Rendering.** `renderPlan` switches on `intent`. A paragraph's numbers may only come
from the keys it declared, and `number()` throws if a renderer asks for anything else —
so an undeclared number cannot reach the text in the first place. Two consequences are
worth stating because they are deliberate:

- **Free text is quoted only when it carries no numeral.** A solver note or disclaimer
  containing digits is left in the `cfd-run` record and is not copied into prose; the
  Results paragraphs already reproduce those numbers in structured form. This is what
  keeps "every printed number has a declared key" a check and not a slogan.
- **The abstract is not a planned section.** It is generated from the same numbers table
  and is length-checked (`JOURNAL-ABSTRACT`), but it has no section heading to attach a
  paragraph id to, so the plan covers the numbered sections. Stated here rather than
  implied by silence.

`ManuscriptPayload.schemaVersion` stays `2`: `planRef`, `citations` and the per-section
`paragraphs` are additive. `planRef = { seq, hash }` names the plan record; `hash` is its
`payloadHash`, so a reader can recompute it from the payload alone.

**References.** Every reference is set by `agents/citation.ts` (RULE-032) and the list
is round-tripped before the stage returns — see §5.

**Verification.** The whole text — title, abstract, sections, reference list — still goes
through `verifyClaims`. One unbacked number or one unresolved DOI throws
`UnverifiableClaimError` (422) and no manuscript record is written.

### Stage 6 — Peer Review Council

Seven explicit checks, each with a rule id: RULE-001 (numbers trace), RULE-002 (DOIs
resolve), journal abstract length, ≥3 references, RULE-004 (disclosure present),
RULE-041 (valid GCI), and RULE-030 (the text is a projection of its plan). Any _major_
comment makes the verdict `revise`; synthetic results always produce one.

The projection check is the interesting one, because it compares two records instead of
trusting one. It reports a `major` comment when

- a planned paragraph id is missing from the text, or the text has a paragraph id the
  plan never issued;
- a paragraph prints a number that is not one of the values its `numberKeys` declare
  (rounded prints of declared values are accepted: a plan declares values, not
  spellings);
- `planRef` does not resolve, points at a record of another kind, or names a hash the
  record does not have.

An overlong paragraph (more than `targetWords` + 20 %) is a `minor` finding: length is a
budget, not a claim. A manuscript written before G carries neither ids nor `planRef`;
that case is recorded as `skipped`, never as a pass.

### Stage 7 — Revision & Compliance

Journal profile checks: abstract length, required sections, numbered citations,
RULE-032's `citation-format` (a reference the formatter marked `incomplete` is a
blocking issue; one that merely lacks optional fields is a minor note), and a blocking
`review-verdict` issue when the council asked for revisions.

### Stage 8 — AeroWiki & Submission

Compiles a markdown wiki article from the manuscript, **renders the LaTeX project**, and
builds a submission **manifest** — file names and SHA-256 of payloads. Nothing is uploaded
to a journal and no `.docx` exists. The stage returns `blocked` when the review did not
pass, compliance is not met, the numbers are synthetic, or the PDF could not be typeset,
which marks the run failed: a prototype must not be able to "submit" itself.

The renderer mirrors the SU2 pattern — **detected, never assumed**:

- The `.tex` is always produced: `manuscript.tex`, `references.bib`, and
  `figure-gci.tex`/`figure-gci.dat` when the run has a mesh study. Files land in
  `$AEROSCRIBE_DATA_DIR/manuscripts/<runId>/` and the payload records each one's
  SHA-256 and size.
- The PDF exists only when `LATEX_BINARY` answered `--version`. Otherwise the record says
  `typeset: "source-only"` and stage 8 adds
  `the manuscript PDF was not typeset (LATEX_BINARY is not set)`. A journal wants a PDF;
  a source-only package is a legitimate **failure**, not a footnote.
- The `.tex` header carries the run id, the template, the manuscript's own
  `generated_at` and the SHA-256 of every input payload, so the file states its own
  provenance.
- **The figure is pgfplots source (RULE-033).** `figure-gci.tex` holds two panels —
  value against cell count and Grid Convergence Index against cell count — over
  `figure-gci.dat`, one row per mesh level with `nan` where the study reports no GCI.
  There is no `\includegraphics` and no binary asset: the figure is diffable text. The
  axis labels take the quantity and unit from the payload, a legend appears only when
  the figure has more than one series, and the header carries
  `% provenance: run <id>, evidence seq <n>, sha256 <hash>`. The caption repeats the run,
  the record and the artefact digest, because a header does not survive a PDF.
  `figure-gci.dat` is data only and opens with its column header (`cells value gci_percent`):
  pgfplots reads the first line of the table as the header, so a provenance comment above it
  is skipped and the first data row becomes the column names — a real `pdflatex` run failed
  exactly that way. The `.dat` is traced through the render record, which hashes it.
- **Claim verification runs on the rendered text** (`stripLatex` of the abstract and
  sections), against the same policy stage 5 used. A number that never reached a record
  cannot reach the PDF either. The figure's caption sits in its own `\input` file and is
  not part of that span: it states provenance (a record number and a hexadecimal
  digest), which is not a quantitative claim any evidence record can back.
- Templates are built on the standard `article` class (`aiaa-style`, `elsevier-style`):
  the publisher class files are not shipped with TeX Live, and substituting a lookalike
  would be a claim the PDF cannot support. The record names the template that was used
  and says the layout must be checked against the journal's current guidelines.
- Deterministic: the same record renders byte-identical files, because the header uses
  the manuscript's timestamp rather than the wall clock.

The render is its own evidence record (`manuscript-render`), produced by this stage and
appended right after the package record. The package's `files` manifest covers the
evidence that existed when stage 8 began; the render record is the index for the files
themselves.

Before that, it reads the newest `doi-recheck`: a `broken` or `mismatch` reference is a
named blocker (`reference ref-01 (10.2514/1.j060001) no longer resolves: …`). When there
is no re-check at all, the generation-time verification stands and is reported as
`verifiedAt`; only if that timestamp is older than `AEROSCRIBE_DOI_MAX_AGE_DAYS` does the
stage add `references have not been re-verified in this run`. The stage's
`metrics.references` says which of the three situations the run is in:
`generation-time only`, `re-checked`, `re-checked: problems`.

---

## 4. Evidence registry

`store/evidence.ts`, one NDJSON line per record, append-only.

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
- **One record per stage execution, plus artefacts** — an executed stage appends
  exactly one record (`stage-output` for most, `cfd-run`/`manuscript`/… for four of
  them), and stage 8 appends a second one for the rendered manuscript. The only other
  writer is an explicit action: a DOI re-check appends one `doi-recheck` record with
  `stageId: null`, because it describes a fact about a run, not a stage transition.

Kinds, and who writes them:

| Kind                 | Written by                             | `stageId` |
| -------------------- | -------------------------------------- | --------- |
| `stage-output`       | stages 0 and 3                         | the stage |
| `literature-search`  | stage 1                                | `1`       |
| `novelty-report`     | stage 2                                | `2`       |
| `cfd-run`            | stage 4                                | `4`       |
| `manuscript-plan`    | stage 5, before its own record         | `5`       |
| `manuscript`         | stage 5                                | `5`       |
| `review-report`      | stage 6                                | `6`       |
| `compliance-report`  | stage 7                                | `7`       |
| `submission-package` | stage 8                                | `8`       |
| `manuscript-render`  | stage 8, right after the package       | `8`       |
| `doi-recheck`        | `POST …/references/recheck` or the CLI | `null`    |

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

### AIAA citations (RULE-032)

`agents/citation.ts` is the only place a bibliography string is assembled. `formatAiaa`
produces one of three AIAA forms from the structured `ReferenceRecord`:

| Style             | Form                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `aiaa-journal`    | `[N] A. Author and B. Author, "Title," Journal, Vol. V, No. N, YYYY, pp. P–P. doi:…` |
| `aiaa-conference` | `[N] A. Author, "Title," Proceedings, Publisher, YYYY, pp. P–P. doi:…`               |
| `aiaa-book`       | `[N] A. Author, Title, Publisher, YYYY, pp. P–P. doi:…`                              |
| `incomplete`      | whatever fields exist, plus every core field the record is missing                   |

Rules that matter:

- **Four or more authors become three and `et al.`**, as AIAA requires.
- **A missing field is omitted and listed** in `missing` — never `Vol. ,` and never a
  range inferred from the DOI. Volume, issue, pages and DOI are optional (a preprint has
  no volume); authors, title, year, venue and — for books — publisher are core, and their
  absence makes the style `incomplete`.
- **The city an AIAA book entry prints is always listed as missing**, because no provider
  reports it. That is the honest output, not an omission to be papered over.
- **Every reference is round-tripped.** `validateCitations` formats, parses back with
  `parseAiaa`, and compares each field that form prints. A lost volume, a swallowed page
  range or a dropped `et al.` throws before the manuscript record is written. `parseAiaa`
  understands this formatter's grammar and nothing else; text it cannot parse returns
  `null` (which the validator reports) rather than a guessed citation.
- **Stage 7 turns that into an issue.** `citation-format` is `major` when a reference is
  `incomplete`, `minor` when a form merely omitted optional fields, and absent when the
  manuscript carries no citation records at all (a pre-G payload).

Known limitation, stated rather than hidden: an author name containing a comma cannot
survive a comma-separated author list, and the round-trip validator fails the stage when
it happens instead of emitting a wrong citation.

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

### Structured references (`literature/reference.ts`)

A citation is a set of fields, not a sentence. Stage 1 therefore stores
`ReferenceRecord`s, and the writer renders from them:

```ts
{
  key: 'ref-01', index: 1, doi: '10.2514/1.j060001',
  title: '…', authors: ['A. Author', 'B. Author'], year: 2024,
  venue: 'AIAA Journal', volume: '62', pages: '1201-1215', publisher: 'AIAA',
  url: 'https://doi.org/…',
  verified: { verifiedAt: '2026-10-31T10:00:00.000Z', provider: 'crossref', titleSimilarity: 1 }
}
```

- **Absent stays absent.** arXiv reports no volume or pages, so those are `null`; nothing is
  derived from the DOI or the year. `missingFields()` lists what a citation style would have
  to leave out, which is what the future AIAA formatter reports rather than fills in.
- **The venue fallback is a fact, not a guess.** `venue` falls back to `arXiv preprint` only
  because that is where an arXiv record is published.
- **Verification is timestamped.** `verified.verifiedAt` is the moment the DOI resolved, taken
  from the literature service's clock — the input a later re-check compares against.
- **Payload versions.** `literature-search` and `manuscript` are at `schemaVersion: 2`;
  `readReferences()` upgrades a v1 payload (`{index, citation, doi}`) to records with
  `legacy: true` and every unprovable field `null`. It never mines the citation string for a
  title.
- **The verifier reads the prose, not the bibliography.** RULE-001 governs quantitative
  claims; a publication year in a reference line is metadata validated by RULE-002. Including
  it in the numeric check would force the writer to declare other people's years as results.

### Re-checking a stored manuscript's DOIs (`references/recheck.ts`)

A verification is a fact with a timestamp, so it is never overwritten — it is
re-established by appending a `doi-recheck` record that points at the same references.

```
npm run recheck -- --run run-…        # 201-equivalent: prints the summary, exit 0
npm run recheck -- --all              # every run that has a manuscript
```

`recheckRun(runId)` reads the latest `manuscript`, resolves each stored DOI through
`verifyDoi(expectedTitle)`, and appends exactly one record:

```jsonc
{
  "kind": "doi-recheck",
  "stageId": null,
  "payload": {
    "stage": "reference-recheck",
    "schemaVersion": 1,
    "runId": "run-…",
    "checkedAt": "2026-10-31T09:00:00.000Z",
    "offline": false,
    "maxAgeDays": 30,
    "results": [
      {
        "key": "ref-01",
        "doi": "10.2514/1.j060001",
        "title": "…",
        "status": "fresh",
        "reason": "…",
        "provider": "crossref",
        "titleSimilarity": 0.97,
        "previousVerifiedAt": "2026-10-01T…",
      },
    ],
    "summary": { "fresh": 1, "stale": 0, "broken": 0, "mismatch": 0, "unverified": 0, "total": 1 },
  },
}
```

| Status       | Meaning                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| `fresh`      | resolved now, and the stored verification is within `AEROSCRIBE_DOI_MAX_AGE_DAYS` |
| `stale`      | resolved now, but the stored verification is older than that limit                |
| `broken`     | the DOI no longer resolves anywhere the service can reach                         |
| `mismatch`   | it resolves to a different paper (title similarity below the verifier's floor)    |
| `unverified` | no DOI, or offline mode — **offline never claims a DOI is verified**              |

The classification is pure (`classifyVerification`), so every status is unit-tested
without a network. `mismatch` carries the closest rejected record in
`DoiVerification.candidate`, which the re-check copies into `reason` — a reviewer
learns what the DOI now points at, not just that it changed.

`GET /api/v1/runs/:id/references` joins the stored references with the newest
re-check: per reference the generation-time `verifiedAt`/`verifiedProvider` and the
latest `status`, plus a run-level `status` of `unchecked` (never checked),
`attention` (broken or mismatch), `unverified` (nothing resolved), `stale` or
`current`. `unchecked` is deliberately distinct from `current`: an absent check is
not a passing check.

Every stored payload carries a positive integer `schemaVersion` (`orchestrator.assertVersionedPayload`
refuses to record one that does not). Adding a field does not bump it; renaming or changing the
meaning of one does.

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

Base path `/api/v1`. `/health`, `/api/v1/capabilities` and `/api/v1/auth/config` are always
open; everything else needs a credential in whichever of the three auth modes the process was
booted with (`AEROSCRIBE_AUTH`, §9): nothing at all (`none`), one shared key (`token`), or a
verified OIDC identity (`oidc`). Errors are always
`{ "error": { "code", "message", "details? } }`.

| Method | Path                                     | Purpose                                                            |
| ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/health`                                | liveness, capabilities, `authRequired`, `authMode`, `store`        |
| GET    | `/api/v1/capabilities`                   | literature mode, SU2 availability, storage, `auth.mode`            |
| GET    | `/api/v1/auth/config`                    | how to log in: mode, issuer, client id, scopes                     |
| GET    | `/api/v1/me`                             | `{ authMode, principal }`; `principal` is `null` in `none`/`token` |
| GET    | `/api/v1/users`                          | every account, admin only, `oidc` only                             |
| PATCH  | `/api/v1/users/:sub`                     | `{ role }`, admin only; `409` on self-demotion                     |
| GET    | `/api/v1/runs`                           | list runs, newest first                                            |
| POST   | `/api/v1/runs`                           | create a run (`topic` ≥ 8 chars)                                   |
| GET    | `/api/v1/runs/:id`                       | one run                                                            |
| POST   | `/api/v1/runs/:id/advance`               | execute the current stage                                          |
| POST   | `/api/v1/runs/:id/gates/:gateId/approve` | approve the open gate                                              |
| POST   | `/api/v1/runs/:id/gates/:gateId/reject`  | send the stage back for revision (`note`)                          |
| GET    | `/api/v1/runs/:id/evidence?kind=`        | registry records for the run                                       |
| GET    | `/api/v1/evidence/verify`                | re-hash the whole chain from disk                                  |
| GET    | `/api/v1/evidence/:seq/artefacts/:name`  | artefact bytes, re-hashed; `409` on a mismatch                     |
| GET    | `/api/v1/audit?runId=&limit=`            | audit trail (read-only)                                            |
| GET    | `/api/v1/literature/search?q=&limit=`    | live/offline search                                                |
| POST   | `/api/v1/literature/verify-doi`          | `{ doi, expectedTitle? }` → 200 or 422                             |
| POST   | `/api/v1/claims/verify`                  | `{ text, runId }` → claim report                                   |
| POST   | `/api/v1/runs/:id/references/recheck`    | re-resolve every stored DOI, one record                            |
| GET    | `/api/v1/runs/:id/references`            | stored references joined to latest re-check                        |
| GET    | `/api/v1/runs/:id/manuscript.tex`        | LaTeX source, `text/x-tex`, hash in a header                       |
| GET    | `/api/v1/runs/:id/manuscript.pdf`        | the typeset PDF, or `503` naming `LATEX_BINARY`                    |

Status codes used: `200`, `201`, `400` invalid request, `401` missing/wrong/expired
credential, `403` authenticated but not allowed (see below), `404` unknown run, account or
route, `409` gate discipline (**and** no manuscript to re-check, no rendered manuscript yet,
or an admin removing their own admin role), `422` DOI did not resolve / unverifiable claim,
`429` rate limited, `500` an artefact on disk no longer matches its record, `502` upstream
failed after retries (including a LaTeX engine that exited non-zero), `503` capability
unavailable (SU2, a PDF that was never typeset, or an identity provider that cannot be
reached).

The re-check route is idempotent in effect, not in output: calling it twice appends two
records and the newer one wins. It answers
`201 { record, summary, checkedAt, offline }`. `GET …/references` answers
`{ runId, references, checkedAt, rechecks, status }` and `409`s for a run without a
manuscript, because there is nothing to join.

Example — the full loop for one stage:

```bash
curl -s localhost:8787/api/v1/runs -H 'content-type: application/json' \
  -d '{"topic":"transonic wing drag prediction","options":{"solver":"synthetic"}}'
curl -s -X POST localhost:8787/api/v1/runs/run-1/advance -d '{"actor":"ana"}'
curl -s -X POST localhost:8787/api/v1/runs/run-1/gates/GATE-0/approve -d '{"actor":"reviewer"}'
curl -s 'localhost:8787/api/v1/runs/run-1/evidence?kind=stage-output'
curl -s localhost:8787/api/v1/evidence/verify
```

### Accounts, roles and what they may do

`AEROSCRIBE_AUTH=oidc` turns a bearer token into a `Principal`. Three roles, one table
(`services/api/src/auth/policy.ts`):

| Action               | researcher        | reviewer   | admin      |
| -------------------- | ----------------- | ---------- | ---------- |
| create a run         | yes               | no         | yes        |
| read a run           | own runs          | any run    | any        |
| run a stage          | own runs          | no         | any        |
| approve/reject       | own runs          | any run    | any        |
| read the audit       | own runs' entries | everything | everything |
| list/change accounts | no                | no         | yes        |

Four decisions this table encodes, each of which was the alternative to a bug:

- **Reviewers produce nothing.** A reviewer that can run a stage can write the evidence it
  then approves, so `run:create` and `run:advance` are closed to it. What it can do is read
  any run and judge any gate.
- **Ownership is required, not implied.** A run created before accounts existed has no
  `ownerSub`, and neither does one created in `none`/`token` mode; those are reviewer/admin
  territory. `authorize` treats "no owner" as "nobody owns it", never as "everybody does".
- **The audit actor is the token's subject.** In `oidc` mode a `POST …/approve` body may still
  carry `actor`, and it is ignored: the entry says `user:<sub>`. Before accounts the body's
  string was recorded verbatim, which meant any caller could approve a gate as somebody else.
- **An unreachable IdP is `503`, not `401`.** `401` would log every user out during an outage
  and hide the real fault; the code is `auth_unavailable` and the message names the issuer.

A first login creates the account as `researcher`. `AEROSCRIBE_ADMIN_SUBS` names subjects
that arrive as `admin`; a login can promote on that list and can never demote, so
`PATCH /api/v1/users/:sub` is the only way down — and it refuses to let the last admin
remove themselves (`409 self_demotion`). `GET /api/v1/auth/config` is the one `/api/v1`
route that needs no credential, because it is how a client learns how to get one.

In `none` and `token` mode there is no principal at all: `principal: null`, no ownership
filter on `GET /api/v1/runs`, and the body's `actor` is recorded as typed. That is the
documented behaviour of a deployment with one shared credential — not an oversight, and not
something `/health` hides: it reports `authMode`.

### Calling it from the browser

The dashboard talks to exactly these routes, through one client
(`apps/dashboard/src/api/client.ts`) whose types come from `packages/contract`. Two rules:

**The mode is a build decision, not a toggle.** `VITE_API_URL` unset ⇒ fixture mode, and the
built bundle contains no API address at all. Set ⇒ live mode, and a badge at the top of every
screen says which one you are looking at. There is no runtime switch that could turn demo data
into something that looks live.

**No secret ever reaches the bundle.** In development, point `VITE_API_URL=` (empty) at the Vite
dev server and let it proxy: `VITE_API_PROXY_TARGET` says where the API is, and
`AEROSCRIBE_API_KEY` (deliberately _not_ `VITE_`-prefixed) is injected as a bearer header by the
dev server. `scripts/check-bundle-secrets.mjs` runs at the end of `npm run build` and fails if a
secret value, or a non-`VITE_` environment read in client code, made it into `dist/`.

```bash
# terminal 1
AEROSCRIBE_DATA_DIR=./data npm run dev:api        # http://127.0.0.1:8787

# terminal 2 — live mode through the proxy
printf 'VITE_API_URL=\n' > apps/dashboard/.env.local
npm run dev:dashboard                              # http://localhost:5174
```

Without `apps/dashboard/.env.local` the dashboard is fixture mode, which is what the deployed
Pages build is: it has no API to talk to, so it says so.

`services/api/test/contract.test.ts` drives a real nine-stage run through these routes and compares
the shape of every response with `apps/dashboard/src/api/__fixtures__/shapes.json`. A server change
that adds, removes or retypes a field fails that test until the dashboard's mappers are updated;
`RECORD_FIXTURES=1` re-records the capture.

---

## 9. Configuration

| Variable                         | Default                                       | Meaning                                                                            |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `HOST`                           | `127.0.0.1`                                   | bind address (use `0.0.0.0` in a container)                                        |
| `PORT`                           | `8787`                                        | bind port                                                                          |
| `AEROSCRIBE_DATA_DIR`            | `./data`                                      | registry, runs, audit, CFD studies                                                 |
| `AEROSCRIBE_STORE`               | `filesystem`                                  | `filesystem` or `postgres`; anything else stops the process at boot                |
| `AEROSCRIBE_DATABASE_URL`        | _unset_                                       | required by `postgres`, refused when the store is `filesystem`                     |
| `AEROSCRIBE_COORDINATION`        | `process`                                     | `process` or `redis`; where the rate limit and the stage lock live                 |
| `AEROSCRIBE_REDIS_URL`           | _unset_                                       | required by `redis`, refused when coordination is `process`                        |
| `AEROSCRIBE_AUTH`                | _derived_                                     | `none` \| `token` \| `oidc`; unset ⇒ `token` when a key is configured, else `none` |
| `AEROSCRIBE_API_KEY`             | _unset_                                       | the shared key in `token` mode; refused with `oidc`, and with `none`               |
| `OIDC_ISSUER`                    | _unset_                                       | required by `oidc`; `https`, loopback exempt; must match the discovery document    |
| `OIDC_AUDIENCE`                  | _unset_                                       | required by `oidc`; the `aud` every token must carry                               |
| `OIDC_CLIENT_ID`                 | = `OIDC_AUDIENCE`                             | the public client id the dashboard uses                                            |
| `OIDC_SCOPES`                    | `openid profile email`                        | space- or comma-separated scopes the dashboard asks for                            |
| `OIDC_CLOCK_SKEW_SECONDS`        | `60`                                          | tolerated clock difference with the issuer                                         |
| `AEROSCRIBE_ADMIN_SUBS`          | _unset_                                       | comma-separated subjects that arrive as `admin`; `oidc` only                       |
| `AEROSCRIBE_CONTACT_EMAIL`       | _unset_                                       | Crossref polite-pool `mailto`                                                      |
| `AEROSCRIBE_OFFLINE`             | `false`                                       | `true` ⇒ fixture corpus, no network                                                |
| `SU2_CFD_BINARY`                 | _unset_                                       | absolute path; availability is probed, not assumed                                 |
| `LATEX_BINARY`                   | _unset_                                       | absolute path to `pdflatex`; a PDF is produced only when it answers `--version`    |
| `LATEX_TIMEOUT_MS`               | `120000`                                      | wall-clock limit per engine pass (two passes)                                      |
| `AEROSCRIBE_CORS_ORIGINS`        | `http://localhost:5173,http://localhost:5174` | comma-separated allowlist                                                          |
| `AEROSCRIBE_UPSTREAM_TIMEOUT_MS` | `15000`                                       | per-attempt and per-provider deadline                                              |
| `AEROSCRIBE_RETRY_BASE_MS`       | `2000`                                        | first backoff step (RULE-042)                                                      |
| `AEROSCRIBE_DOI_MAX_AGE_DAYS`    | `30`                                          | age at which a stored DOI verification is `stale` (RULE-002)                       |
| `SEMANTIC_SCHOLAR_API_KEY`       | _unset_                                       | server-side only; never sent to the browser                                        |
| `LOG_LEVEL`                      | `info`                                        | `debug` \| `info` \| `warn` \| `error` \| `silent` (RULE-053)                      |
| `AEROSCRIBE_VERSION`             | `dev`                                         | release identifier reported by `/health`                                           |
| `GIT_SHA`                        | `unknown`                                     | commit the image was built from, reported by `/health`                             |

Every variable is described in `services/api/.env.example`; copy it to `services/api/.env`
for local work. Neither browser app reads any of them — a key in a Vite bundle is a public key.

### Logs

One JSON object per line on stdout; `jq` is the intended reader.

```json
{
  "ts": "2026-10-31T10:00:00.000Z",
  "level": "info",
  "event": "stage.end",
  "request_id": "…",
  "run_id": "run-…",
  "stage_id": 4,
  "stage": "Evidence Generation",
  "status": "gate_pending",
  "evidence_seq": 4,
  "evidence_kind": "cfd-run"
}
```

- `request_id` comes from the inbound `x-request-id` (or a generated UUID) and is echoed on the
  response, so a user's screenshot of the header identifies the four log lines behind it.
- `run_id` is bound from the request path (`/api/v1/runs/<id>/…`), which is what makes a stage
  failure searchable without knowing the request.
- Events: `http.request`, `http.error`, `http.unauthorised`, `http.rate_limited`, `stage.start`,
  `stage.end`, `stage.failed`.
- **Redaction is built in.** Keys named like credentials (`authorization`, `api-key`, `token`,
  `password`, …) are masked at any depth, and the configured secrets (`AEROSCRIBE_API_KEY`,
  `SEMANTIC_SCHOLAR_API_KEY`) are masked by value — a message that interpolates one is caught
  even under an innocent field name.

### Running it

```sh
# Laptop
npm ci && npm run start:api

# Container
docker build -t aeroscribe-api .
docker run --rm -p 8787:8787 \
  -e AEROSCRIBE_API_KEY="$(openssl rand -hex 32)" \
  -e AEROSCRIBE_CONTACT_EMAIL=you@example.org \
  -v aeroscribe-data:/data \
  aeroscribe-api

# Same image, state in Postgres instead of the volume
docker run --rm -p 8787:8787 \
  -e AEROSCRIBE_API_KEY="$(openssl rand -hex 32)" \
  -e AEROSCRIBE_STORE=postgres \
  -e AEROSCRIBE_DATABASE_URL='postgres://aeroscribe:…@db:5432/aeroscribe' \
  aeroscribe-api
```

The Postgres variant still wants a volume for `/data`: CFD working directories and rendered
manuscripts are local files in both modes. `pg` is a runtime dependency, so it is installed by
the image's `npm ci --omit=dev`; the embedded server the tests use is a dev dependency and is
not in the image. Run `npm run db:migrate` against the database before the first start.

A PDF needs a TeX engine in the image, which is opt-in because it costs about 250 MB:

```sh
docker build -t aeroscribe-api:tex --build-arg INSTALL_LATEX=true .
docker run --rm -p 8787:8787 -e LATEX_BINARY=/usr/bin/pdflatex \
  -v aeroscribe-data:/data aeroscribe-api:tex
```

Without both, the image is smaller and stage 8 says
`the manuscript PDF was not typeset (LATEX_BINARY is not set)` — the same answer a laptop
without TeX gives. `LATEX_BINARY` is not baked into the default image on purpose: a path to a
binary that is not there would be reported as a toolchain that "did not answer", which is a
worse error than an unset one.

The image installs with `--omit=dev`, which is why `tsx` is listed in `dependencies`: the
service runs its TypeScript source, and there is no compiled artifact to ship. `HOST`
defaults to `0.0.0.0` inside the image, the health check polls `/health`, and `/data` is a
volume — without it the evidence registry dies with the container. CI builds the image and
waits for `/health` inside it (`api-image` job), so the Dockerfile is a tested artefact rather
than reviewed configuration. Two further CI jobs cover both outcomes: `latex` installs
TeX Live and runs `npm run smoke:latex -- --require-pdf`, so the PDF path is exercised on every
push instead of only where a developer happens to have TeX; `latex-without-engine` asserts the
opposite outcome — the `.tex` is written, `typeset` is `"source-only"` and the blocker is named.

### Storage adapters

The API writes three things — runs, the evidence chain and the audit trail — through the
ports in `services/api/src/store/ports.ts`. One factory (`createStores`) picks the adapter
from `AEROSCRIBE_STORE`, and no route or stage ever sees a concrete class.

| `AEROSCRIBE_STORE`     | Adapter                          | Where the data lives      | Writers |
| ---------------------- | -------------------------------- | ------------------------- | ------- |
| `filesystem` (default) | `store/{runs,evidence,audit}.ts` | `AEROSCRIBE_DATA_DIR`     | **one** |
| `postgres`             | `store/postgres/`                | `AEROSCRIBE_DATABASE_URL` | many    |

Both adapters are exercised by the same suite,
`services/api/test/store-contract.test.ts`: chains, filters, tamper detection, concurrent
appends, audit reads and the probe run through the ports, so a backend that behaves
differently fails a test rather than surprising an operator.
`services/api/test/postgres.test.ts` adds what only a database can prove — the append-only
trigger, two writers keeping one chain, migrations re-run safely, and an import that copies
a chain without recomputing a digest.

**The chain algorithm is written once** (`store/chain.ts`): both adapters hash with the same
function and walk with the same verifier, so "verifies" cannot mean two different things
depending on which store a deployment happens to use.

**`/health`** reports `store: { backend, ok, detail }` and `blobs: { backend, ok, detail }`,
and answers `503` when either probe fails. The probe is a real round trip, not a configuration read: a data directory that
cannot hold a file, or a database that cannot answer `SELECT 1`, means nothing can be
saved. `ok:false` is the honest answer, and a `200` would tell a load balancer to keep
sending work here.

**When the database is down**, every write fails with `503 store_unavailable` and _no_ file
is created on disk. There is no fallback in either direction: a process configured for
Postgres never writes JSON, and a process configured for the filesystem never opens a
connection.

#### Postgres

```
npm run db:migrate            # apply the migrations, safe to re-run
npm run db:verify             # recompute the whole chain from a separate connection
npm run db:import -- ./data   # copy an existing filesystem deployment in, verbatim
```

The schema lives in `services/api/src/store/postgres/migrations/`, applied in file-name
order, one transaction each, recorded in `schema_migrations`.

Append-only is enforced **in the database**: `evidence_append_only` raises on `UPDATE` and
`DELETE`, and `evidence_no_truncate` covers `TRUNCATE`, which bypasses row triggers. The
trigger is there so a bug — or a `psql` session — cannot rewrite history. The hash chain
remains the independent check if somebody drops the trigger, and the contract suite proves
it by disabling the trigger and tampering on purpose.

A single append is one transaction holding
`pg_advisory_xact_lock(hashtext('aeroscribe.evidence'))` around "read the head, insert the
next link". That lock replaces the filesystem adapter's in-process queue and is what makes
two API instances safe. `seq` is the primary key, so even a writer that ignored the lock
cannot fork the chain. The lock is global rather than per-run: at a handful of appends per
stage the contention is irrelevant, and the fix if it ever matters is partitioning the key,
not removing the lock.

`db:import` inserts every record with its original `seq`, `id`, `prevHash`, `hash` and
`createdAt`, verifies the result, and refuses a non-empty target — two chains have no
defined merge. The import is one-way; the rollback is "keep writing files until the import
is verified".

#### Coordination (rate limit and stage lock)

Two decisions are only correct if every instance makes the same one: how much budget a client
has spent, and whether a stage is already running. `services/api/src/coord/` is the port for
both (`Coordinator`), with two implementations.

| `AEROSCRIBE_COORDINATION` | Adapter         | Where the counter and the lock live | Shared between instances |
| ------------------------- | --------------- | ----------------------------------- | ------------------------ |
| `process` (default)       | `coord/process` | memory                              | **no**                   |
| `redis`                   | `coord/redis`   | `AEROSCRIBE_REDIS_URL`              | yes                      |

Setting the URL without the backend, or the backend without the URL, stops the process at
boot — the same contract as `AEROSCRIBE_STORE`/`AEROSCRIBE_DATABASE_URL`. A `REDIS_URL`
inherited from a compose file therefore cannot quietly put a network round trip on every
request in a single-instance deployment, and a process told to share its budget cannot keep
counting locally.

Both Redis operations are scripts, because the read-then-write versions are wrong under
concurrency:

- **Rate limit** — `INCR` then `PEXPIRE` on the first hit, returning the count and the remaining
  TTL. Two instances cannot both spend the last request in a window.
- **Stage lock** — `SET key owner NX PX ttl` claims it. A heartbeat extends it only if the
  caller is still the owner, and release is a compare-and-delete. A lease that expires while a
  slow solver runs is intentional (the TTL is the honest limit); the instance that lost it must
  not delete the winner's lock when it finally returns. `advance` on a run another instance is
  running answers `409` before any work starts.

`/health` reports `coordination: { backend, ok, detail }` and answers `503` when a configured
Redis cannot be reached — a limit that is not being enforced is not a healthy state. A request
the limiter cannot count answers `503 coordination_unavailable`; it is never allowed through on
a local counter. When Redis comes back the process reconnects on its own; no restart needed.

The tests (`services/api/test/redis.test.ts`) run against a real server: two apps sharing a
budget, a lease taken across instances, an expired lease handed over, a heartbeat keeping a
long stage alive, and an unreachable Redis answering `503`. CI starts `redis:7` as a service;
locally the harness uses `AEROSCRIBE_TEST_REDIS_URL`, a `redis-server` binary on `PATH` (or
`AEROSCRIBE_REDIS_SERVER`), and skips with a named reason when neither exists.

Object storage (artefacts) is ROADMAP § 8 D4 and is not built; `AEROSCRIBE_S3_*` does not exist
yet.

#### Artefact bytes

An evidence record names its artefacts by SHA-256. That proves the record was not edited; it
does not let anyone read the file. `services/api/src/blob/` closes the gap with a
content-addressed store: `put` hashes the bytes, writes them under their digest
(`<dataDir>/blobs/sha256/<aa>/<rest>`) with an atomic rename, and returns the reference that
goes into the record. `get` returns `null` for an object that was never stored — an old record,
not an outage — and throws a `503`-mapped error only when the disk itself fails.

```
GET /api/v1/evidence/:seq/artefacts/:name
```

Three outcomes, and they mean different things to whoever is investigating:

| Answer | Meaning                                                                                   |
| ------ | ----------------------------------------------------------------------------------------- |
| `200`  | The bytes, with `x-content-sha256` and an `etag` derived from the recorded digest.        |
| `409`  | The stored bytes no longer hash to the digest in the record (`artefact_hash_mismatch`).   |
| `404`  | No such record, no such artefact in it, or a record written before its bytes were stored. |

The `409` is the point: the route re-hashes on the way out, so the API cannot be used to pass
off altered evidence. It reports both digests and returns no bytes. A record that names a file
whose bytes are not in the store says exactly that instead of answering `404 not found`, which
would claim the artefact never existed.

Storage is local in every mode today. Object storage (ROADMAP § 8 D4) would add an adapter
behind `BlobStore`; the route, the stage handlers and these tests would not change.

Data layout under `AEROSCRIBE_DATA_DIR`:

```
registry.ndjson          append-only evidence chain (never rewritten)
audit.ndjson             append-only audit trail
runs/<runId>.json        run state (atomic replace)
runs/<runId>.options.json run options (survive restarts)
blobs/sha256/<aa>/<rest> artefact bytes, named by their digest
cfd/study-<uuid>/        SU2 working directories: history.csv per mesh level
manuscripts/<runId>/     manuscript.tex, references.bib, figure-gci.tex|.dat, PDF when typeset
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
| Second `advance` while a stage runs    | in-flight guard per run; the handler is not invoked twice                       | `409 conflict` naming the running stage                  |
| Process restarts mid-run               | run state and options reload from disk; a `running` stage can be advanced again | run continues, evidence chain intact                     |
| `SIGTERM` (`docker stop`)              | stops accepting requests, lets in-flight writes finish, exits 0 after ≤30 s     | the container exits cleanly instead of being killed      |
| Body over 1 MiB                        | rejected before parsing                                                         | `413 payload_too_large`                                  |

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
| RULE-041 | checksums for computed artefacts; valid GCI | `store/evidence.ts` hash chain, `cfd/gci.ts` validity gates    |
| RULE-042 | retry with exponential backoff              | `literature/http.ts` `backoffDelay` / `fetchWithRetry`         |
| RULE-043 | append-only evidence                        | `store/evidence.ts` (no update/delete API exists), `verify()`  |

---

## 12. Tests

| File                        | Covers                                                                          |
| --------------------------- | ------------------------------------------------------------------------------- |
| `test/canonical.test.ts`    | canonical JSON, key ordering, hash stability                                    |
| `test/registry.test.ts`     | chain integrity, tamper detection, concurrent appends                           |
| `test/retry.test.ts`        | backoff schedule, `Retry-After`, timeout vs abort vs DNS messages, spacer       |
| `test/gci.test.ts`          | order recovery, extrapolation, oscillatory and non-asymptotic rejection         |
| `test/literature.test.ts`   | provider mapping, JATS stripping, dedupe/rank, DOI verification, offline rules  |
| `test/su2.test.ts`          | `history.csv` parsing, fake-binary study, failure paths                         |
| `test/cfd-service.test.ts`  | solver selection, capability refusal, synthetic labelling                       |
| `test/claims.test.ts`       | extraction, precision rules, derived counts, DOI masking                        |
| `test/agents.test.ts`       | stages 0–3 payloads, stage 5 refusal, stage 6 verdict                           |
| `test/orchestrator.test.ts` | full 9-stage run, gate discipline, revision loop, restart durability            |
| `test/http.test.ts`         | auth on/off, rate limit, error shapes, CORS, body limits, every route           |
| `test/su2-http.test.ts`     | `solver: "su2"` over HTTP with a fake binary: meshes, digests, GCI, 502 path    |
| `test/config.test.ts`       | env parsing, SU2 detection, capability reporting, on-disk wiring, `startServer` |
| `test/shutdown.test.ts`     | SIGTERM drain, single exit, deadline exit code                                  |
| `test/docs.test.ts`         | `docs/BACKEND.md` routes/env/stages and `specs/architecture.md` match the code  |
| `test/reference.test.ts`    | structured references, absent fields, v1 payload upgrade, key ordering          |
| `test/logger.test.ts`       | level filtering, redaction (key and value), scope propagation                   |
| `test/integrity.test.ts`    | no model SDK, no `console.*`, integrity-table citations resolve                 |

The suite is hermetic: no network, no solver, temporary data directories, and fake
binaries written into `os.tmpdir()`. `npm run smoke:*` is the by-hand equivalent that
_does_ touch the outside world, on purpose.

`npm run coverage` runs the same suite with the thresholds in `vitest.config.ts`; CI uses it
instead of `npm test` because thresholds only apply when coverage is collected.

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
8. A daily DOI re-check, if you promise reviewers that stored citations still resolve:

   ```cron
   # 03:20 every day, against the same AEROSCRIBE_DATA_DIR as the service
   20 3 * * * cd /srv/aeroscribe && AEROSCRIBE_DATA_DIR=/data npm run recheck -- --all >> /var/log/aeroscribe-recheck.log 2>&1
   ```

   There is no scheduler inside the API — a timer nobody can pause, test or explain to an
   auditor is worse than a cron line in the operator's runbook. The CLI is also the only
   path that writes `doi-recheck` records outside an HTTP request, and it audits with
   `actor: "cli"`. Exit `1` means at least one DOI is `broken` or `mismatch`; alert on it
   rather than ignoring it, or stage 8 will refuse to submit that run anyway.

---

## Keeping this document true

Each section maps to a file that can be read in one sitting. When a change makes a
statement here false, update the statement in the same commit — the review process
treats a stale backend document as a bug, because this file is what an operator trusts
at 3 a.m.
