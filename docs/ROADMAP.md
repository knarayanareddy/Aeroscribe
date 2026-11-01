# Remaining work — plan and checklist

This is the execution plan for the eight gaps listed in
[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) and
[`../specs/integrity-rules.md`](../specs/integrity-rules.md). It is a **plan**, not a status
report: nothing below is built until its checklist is ticked and its acceptance criteria are
demonstrated against the running code.

Two rules for using this document:

1. A workstream is done when its **acceptance** block is true of the repository, not when its
   checkboxes are ticked. Checkboxes track effort; acceptance tracks truth.
2. Every PR that touches this plan updates the plan, [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md)
   and [`../specs/integrity-rules.md`](../specs/integrity-rules.md) in the same change. The
   enforcement table is the promise; a table that lags the code is the defect this project
   keeps fixing.

---

## 0. Summary

| #   | Gap                                    | Workstream | Milestone | Size\*  | Depends on |
| --- | -------------------------------------- | ---------- | --------- | ------- | ---------- |
| 1   | Dashboard ↔ API wiring                 | **A**      | M1        | 5–6 d   | P1         |
| 2   | LaTeX / PDF typesetting                | **B**      | M2        | 4–6 d   | P1, G3     |
| 3   | Per-manuscript DOI re-verification     | **C**      | M3        | 2–3 d   | P1         |
| 4   | Postgres / Redis / S3                  | **D**      | M4        | 8–10 d  | —          |
| 5   | Staging environment + image publishing | **E**      | M5        | 3–5 d   | D, A       |
| 6   | Accounts                               | **F**      | M6        | 5–7 d   | D, A       |
| 7   | RULE-030 / 032 / 033                   | **G**      | M2–M3     | 4–5 d   | P1, B      |
| 8   | RULE-053 structured logging            | **H**      | M0        | 1.5–2 d | —          |
| —   | RULE-022 (N/A by design)               | **I**      | M0        | 0.5 d   | —          |

\* Engineering days for one experienced engineer, including tests and documentation, ±40 %.
Sequential total ≈ **35–45 days**. With one engineer working A/B/C before D/E/F, a usable
live-dashboard demo lands in ~3 weeks; the service-grade stack lands ~5 weeks after that.

**If only three things get done, do A, B, C.** They convert claims the project already makes
(“the dashboard is implemented”, “a manuscript is produced”) into things a stranger can click.

---

## 1. Ground truth: where each gap actually is

Every row names the code that would have to change. Nothing here is inferred from prose.

| Gap                   | Current state, verified in code                                                                                                                                                                                                                              | Consequence today                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Dashboard wiring      | `apps/dashboard/src/state/PipelineProvider.tsx:16` seeds `useReducer` from `mockData`; every view imports `../data/mockData` directly; `apps/dashboard/vite.config.ts` has no proxy                                                                          | The only way to see a real run is `curl`. The UI is a clickable prototype.                             |
| LaTeX / PDF           | `apps/dashboard/src/components/ManuscriptView.tsx:31` builds a `.tex` string in the browser; stage 8 (`services/api/src/agents/knowledge.ts:42`) packages evidence hashes and states “Manifest only: no PDF or .docx is compiled by this service” (line 109) | No server-side source of truth for the manuscript, no bibliography, no PDF anywhere.                   |
| DOI re-verification   | `services/api/src/literature/index.ts:150` verifies at retrieval; `ManuscriptPayload.references` (`agents/writing.ts:26`) keeps only `{ index, citation, doi }` — no timestamp, no provider                                                                  | A DOI that resolves in March and 404s in June is still presented as verified by the stored manuscript. |
| Postgres / Redis / S3 | `store/evidence.ts` states “single writer”; `store/runs.ts` writes one JSON file per run; `http/rateLimit.ts:16` and `orchestrator.ts` in-flight set are per-process; CFD artefacts stay on local disk (`cfd/su2.ts:184`)                                    | One API instance, one disk. No horizontal scale, no shared rate limit, no durable artefact store.      |
| Staging / publishing  | `.github/workflows/deploy.yml` publishes static apps to Pages only; `Dockerfile` is built by CI but pushed nowhere                                                                                                                                           | There is no environment where the API runs, so “deploy” means “static site”.                           |
| Accounts              | `AEROSCRIBE_AUTH=none                                                                                                                                                                                                                                        | token                                                                                                  | oidc`; `oidc` verifies a bearer token against the issuer's JWKS and derives roles, ownership and the audit actor (`user:<sub>`) from its subject. `token` mode keeps the shared key for scripts. | The audit trail records the verified subject, not the caller's claim. Multi-user use with roles is possible. |
| RULE-030              | `agents/writing.ts:134` assembles sections in one pass; no plan artefact                                                                                                                                                                                     | “Hierarchical generation” is unimplemented; the rule is prose.                                         |
| RULE-032              | `agents/writing.ts:166` `formatCitation` emits `[n] authors (year). title. doi:…`                                                                                                                                                                            | Not AIAA format; compliance only checks the `[n]` prefix (`agents/review.ts:213`).                     |
| RULE-033              | No figure code anywhere in `services/api`                                                                                                                                                                                                                    | Figures are absent, not wrong; pgfplots is unimplemented.                                              |
| RULE-053              | `http/app.ts:75` uses Hono's text logger behind `enableLogging`                                                                                                                                                                                              | No JSON, no `request_id`, no `run_id`; incidents cannot be reconstructed by machine.                   |
| RULE-022              | No model client in `services/api/package.json`                                                                                                                                                                                                               | Correctly N/A — but nothing stops a future contributor from adding one without telemetry.              |

---

## 2. Order, dependencies, critical path

```
M0  P1 structured references ─┬──────────────────────────────────────────────┐
    H  structured logging    │                                              │
    I  RULE-022 decision     │                                              │
                             ▼                                              │
M1  A  dashboard wiring  ────────────────────────────────┐                  │
                             │                            │                  │
M2  B  LaTeX/PDF  ◄── G3 figures                          │                  │
                             │                            │                  │
M3  C  DOI recheck   G1 plan   G2 AIAA citations           │                  │
                                                           │                  │
M4  D1 ports ─► D2 Postgres ─┬── D3 Redis ── D4 S3 ◄───────┘                  │
                              │                                               │
M5  E  publish image + staging ◄──────────────────────────────────────────────┘
                              │
M6  F  accounts (OIDC)  ◄─────┘
```

- **P1 first.** Three workstreams (B bibliography, C recheck, G2 citations) need structured
  reference metadata that the payload does not carry today. Building any of them first means
  parsing the display string back into fields — the exact fragility this project avoids.
- **H before A.** Once the dashboard talks to a server, the first question in every bug report
  is “which request, which run?”. Text logs cannot answer it.
- **D before E/F**, because a deploy with one disk and no accounts is a demo, and F needs a
  users table. D1 (ports) is a pure refactor and can land any time.
- **Critical path:** P1 → A → D2 → E → F. Everything else can run in parallel with one of those.

Deliberate ordering choice: **A before D**. Wiring the dashboard against the filesystem store
is no harder than against Postgres, it delivers the visible win early, and it exercises the HTTP
contract that D must then preserve.

---

## 3. The honesty contract (every PR, no exceptions)

The repository's value is that its labels are true. Copy this list into every PR description.

- [ ] **No silent fallback.** Every degraded path is explicit in code, in `/health` or
      `/api/v1/capabilities`, and in the UI. Switching from live to fixture data because a
      request failed is a defect, not a convenience.
- [ ] **New capability is observable.** If it can be unavailable, `describeCapabilities()`
      reports it and a test asserts both states.
- [ ] **New evidence kind has a producer.** Added to `EVIDENCE_KINDS`
      (`services/api/src/store/evidence.ts`), written by exactly one place, mapped in the
      dashboard, listed in `docs/BACKEND.md` § 4, and covered by `services/api/test/docs.test.ts`.
- [ ] **Every number on screen is traceable.** Either it came from the API in this render, or
      the cell says “not recorded”. No placeholders, no demo values in live mode.
- [ ] **Rules table updated.** `specs/integrity-rules.md` says what is enforced _now_, and
      `docs/IMPLEMENTATION_STATUS.md` changes the affected row in the same PR.
- [ ] **Payload changes are versioned.** Any change to an evidence payload bumps
      `schemaVersion`; readers tolerate older records (see §4.2).
- [ ] **Coverage thresholds never go down.** If a workstream cannot meet them, that is a review
      finding, not a config edit.
- [ ] **No secret in a browser bundle.** `node scripts/check-bundle-secrets.mjs` runs in CI
      after `npm run build`.
- [ ] **Full gate green:** `npm run typecheck && npm run lint && npm run format:check &&
npm run coverage && npm run build`, plus `npx vitest run services/api` and the smoke
      scripts that the change touches.
- [ ] **New dependency justified** in the PR: what it does, why not 50 lines of our own, licence,
      and `npm audit --omit=dev` clean.

---

## 4. Foundations — milestone M0

### 4.1 P1 — Structured reference records ✅ done

**Why.** `ManuscriptPayload.references` is `{ index, citation, doi }` (`agents/writing.ts:26`).
A bibliography, an AIAA formatter and a re-check all need title/authors/year/venue/volume/pages
as data. Today the only place those exist is the `citation` string, and re-parsing a display
string is how wrong references happen.

**Design.**

```ts
// services/api/src/literature/types.ts
export interface ReferenceRecord {
  key: string; // stable, e.g. `ref-01`
  index: number; // 1-based, matches the manuscript
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null; // journal or preprint server
  volume: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  verified: {
    verifiedAt: string;
    provider: PaperSource | null;
    titleSimilarity: number | null; // null when the provider returned no title
  };
}
```

**Tasks.**

- [ ] Add `volume`, `pages`, `publisher`, `containerTitle` to `literature/types.ts:Paper`, mapped
      from Crossref (`crossref.ts`) and left `null` for arXiv/S2 where the field is absent.
- [ ] Add `toReferenceRecord(paper, verification)` in a new `services/api/src/literature/reference.ts`.
- [ ] Stage 1 emits `references: ReferenceRecord[]`; keep `rejected` and `providerErrors` as-is.
- [ ] Stage 5 consumes `ReferenceRecord`; keep the rendered `citation` string in the payload for
      display and for the existing claim policy.
- [ ] Typed accessors so that old records (`references: {index,citation,doi}[]`) still read:
      `readReferences(record): ReferenceRecord[]` that upgrades v1 on the fly and marks
      `verified.verifiedAt: null` for legacy records.
- [ ] Tests: Crossref mapping with volume/pages; `toReferenceRecord` with a null year; legacy
      payload upgrade; stage 5 output still passes claim verification.
- [ ] Docs: `docs/BACKEND.md` § 6 describes the record; § 3 stage 1 row updated.

**Acceptance.** A run's `literature-search` record carries every field above; the manuscript's
`references[]` carries the same records; a v1 record written before this change still renders in
the dashboard.

**Size.** 1.5–2 days.

**Status.** Landed: `services/api/src/literature/reference.ts`, providers extended
(volume/pages/publisher/venue), stage 1 emits records, stage 5 renders from them, and the
bibliography is excluded from the numeric verifier with the reasoning recorded in
`docs/BACKEND.md` § 6.

### 4.2 Payload versioning policy

- [x] Add `schemaVersion: number` to every payload interface, starting at `2` for the payloads
      P1 touches; absent means `1`.
- [x] The rule is enforced in one place: `assertVersionedPayload` runs before every registry
      append, and a run's records are asserted to be versioned in `orchestrator.test.ts`.
- [x] `docs/BACKEND.md` § 6 documents the policy: additive fields do not bump the version;
      renames and semantic changes do; readers never fail on an unknown field.

### 4.3 H — RULE-053 structured logging ✅ done

**Why.** `http/app.ts:75` logs `--> GET /health 200 1ms` through Hono. A stage that fails at 03:00
leaves no machine-readable trace of which run, which stage, which solver invocation.

**Design.**

- `services/api/src/lib/logger.ts` — ~80 lines, no dependency: levels
  (`debug|info|warn|error`), JSON lines to stdout, `child({ ... })` bindings, redaction of
  `authorization`, `apiKey`, `AEROSCRIBE_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY`, `password`, `token`.
- `services/api/src/lib/requestContext.ts` — `AsyncLocalStorage<{ requestId; runId? }>` so the
  orchestrator and stage handlers log with the run id without threading a logger through every
  signature.
- `http/app.ts` middleware: honour an inbound `x-request-id` or generate a UUID, echo it on the
  response, log one line on completion with `status`, `duration_ms`, `method`, `path`, `subject`.
- Error path logs `error` with `name`, `code`, `run_id`, `stage_id`, and the message; the response
  body is unchanged.
- `describeCapabilities()` / `/health` add `version` (from `package.json`) and `commit`
  (build arg, `unknown` when not set).

**Tasks.**

- [ ] Logger + tests (level filtering, redaction, child bindings, non-serialisable values).
- [ ] Request context + middleware; `LOG_LEVEL` in `config.ts` and `.env.example`.
- [ ] Wire into orchestrator stage transitions (`stage.start`, `stage.end`, `gate.approve`) and
      the shutdown helper.
- [ ] Replace `enableLogging` text logger; keep the flag name working.
- [ ] Tests: request id echo; error log contains the run id; redaction never prints a key.
- [ ] `docs/BACKEND.md` § 9 (`LOG_LEVEL`) and § 10 (log shape); integrity table RULE-053 → **API**.

**Acceptance.** Running a full 9-stage synthetic run with `LOG_LEVEL=info | jq` yields one JSON
object per line; `jq 'select(.event=="stage.end") | .run_id'` prints the run id; a request with
`x-request-id: abc` logs `request_id: "abc"` and echoes the header; `grep -i secret` over the log
is empty.

**Status.** Landed: `lib/logger.ts`, `lib/requestContext.ts`, request middleware, `stage.start` /
`stage.end` / `stage.failed` in the orchestrator, `/health` reports `version`, `commit` and
`logLevel`. Verified against a running server: a `POST …/advance` produced one `request_id` across
`stage.start`, `stage.end` and `http.request`, with `run_id` on all three. `console.*` is gone from
`services/api/src` and a test keeps it that way.

**Size.** 1.5–2 days.

### 4.4 I — Close RULE-022 honestly ✅ done

- [ ] `docs/adr/0001-deterministic-writer.md`: why every stage handler is a deterministic
      function, what RULE-022 would require the day a model is introduced (per-invocation tokens,
      cost, prompt hash, model id, consent), and why building that plumbing now would be fiction.
- [ ] A test that fails if a known model SDK appears in any `package.json`
      (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `langchain`, …), with a comment
      pointing at the ADR.
- [ ] Integrity table: RULE-022 stays **N/A**, with a link to the ADR.

**Size.** 0.5 day.

**Status.** Landed: `docs/adr/0001-deterministic-writer.md`, plus `services/api/test/integrity.test.ts`
which fails if a model SDK appears in any workspace and checks the integrity table's citations
resolve.

---

## 5. A — Wire the dashboard to the API ✅ done

**Why it matters.** This is the single largest credibility gap: the landing page says the agent
API “is implemented and tested”, and the dashboard next to it cannot read a run from it.

**Current state.** `PipelineProvider` seeds `useReducer` from `mockData`; views import fixtures
directly; `vite.config.ts` has no proxy; `apiKey` is a server concept the browser must never hold.

**Design.**

1. **Contract, not copies.** New workspace `packages/contract` holds the wire types the two
   sides share: evidence payload interfaces (moved out of `services/api/src/agents/*`, which
   re-exports them), request bodies, and `ApiError` shape. `PipelineRun`/`StageInfo` stay in
   `@aeroscribe/pipeline` because they already are the shared domain type. This is what stops
   client and server drifting apart.
2. **One client.** `apps/dashboard/src/api/client.ts` — `createApiClient({ baseUrl, token?, fetch })`
   with typed methods for every route in `docs/BACKEND.md` § 8. `fetch` is injected so tests need
   no network. Errors become `ApiClientError { status, code, message }` carrying the server's own
   message (a `409` must read “Stage 0 is waiting for GATE-0”, not “Request failed”).
3. **Two sources behind one interface.**

   ```ts
   // apps/dashboard/src/state/source.ts
   export interface RunSource {
     readonly mode: 'fixtures' | 'live';
     listRuns(): Promise<PipelineRun[]>;
     getRun(id: string): Promise<PipelineRun>;
     createRun(input: { topic: string; journal?: string }): Promise<PipelineRun>;
     advance(id: string): Promise<PipelineRun>;
     approveGate(id: string, gateId: string): Promise<PipelineRun>;
     requestRevision(id: string, gateId: string, note?: string): Promise<PipelineRun>;
     evidence(id: string, kind?: EvidenceKind): Promise<EvidenceRecord[]>;
     capabilities(): Promise<Capabilities>;
   }
   ```

   `createFixtureSource()` wraps the existing reducer semantics; `createApiSource(client)` talks
   HTTP. The provider renders both; the mode is chosen **once, at build time**
   (`VITE_API_URL` set ⇒ live) and shown in the UI.

4. **Mapping is explicit.** `apps/dashboard/src/api/mappers.ts` converts payloads to the view
   models. Where the API has no field, the mapper does not invent one:

   | UI field                                      | API source                                                                      | Live behaviour when absent                                              |
   | --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
   | `Paper.relevanceScore`                        | ranking score computed in `literature/index.ts:rankPapers`, currently discarded | expose it in the payload (small server change)                          |
   | `Paper.tags`                                  | none                                                                            | tags column and filter hidden, with “tags are fixture-only” note        |
   | `Paper.journal`                               | `venue` (P1)                                                                    | “venue not recorded”                                                    |
   | `ResearchGap.noveltyScore` / `competitorRisk` | none (stage 2 emits term coverage)                                              | gap list shows uncovered/covered terms; no numeric score, no risk badge |
   | `CFDResult`                                   | `cfd-run` payload (complete)                                                    | —                                                                       |
   | `ReviewItem` severity                         | `review-report` payload (complete)                                              | —                                                                       |

   Each row above is a **decision to display less**, not to synthesise more.

5. **No secrets in the bundle.** In development the client calls a relative `/api/...` path and
   Vite proxies it (`server.proxy['/api'].target = VITE_API_PROXY_TARGET`) while injecting
   `Authorization` from `AEROSCRIBE_API_KEY` **in the dev server**. A production build may point
   at a public API URL, but only with auth disabled or behind the same-origin proxy from E; the
   bundle never contains a token.
6. **Honest states.** A persistent `DataModeBadge`: `Fixtures · illustrative data`,
   `Live API · <host>`, or `API unreachable · <reason>`. Unreachable never falls back; it retries
   on explicit action and keeps the error on screen.

**Tasks.**

- [x] `packages/contract`: payload types moved, `services/api` re-exports, workspace wired into
      `package.json`, `tsconfig`, Dockerfile manifest list.
- [x] Server: expose `relevance` on literature references; `GET /api/v1/runs/:id/references`
      (shared with C) is not needed yet.
- [x] `apps/dashboard/src/api/{client,errors,mappers}.ts` + unit tests per mapper.
- [x] `apps/dashboard/src/state/{source,useResource}.ts` — abortable loads, explicit
      `refresh()`, no polling unless a stage is `running` (then 3 s with backoff to 15 s).
- [x] `PipelineProvider` accepts a source, exposes `status: 'loading' | 'ready' | 'error'`,
      and keeps `dispatch` only for selection.
- [x] Views migrated one at a time, each keeping a fixture path for tests:
      `Pipeline`, `Dashboard`, `Literature`, `Novelty`, `CFD`, `Manuscript`, `Review`, `Wiki`,
      `Settings` (`Settings` reads `/capabilities`; “Not configured” becomes the server's answer).
- [x] `DataModeBadge` + empty/error states; a test that live mode with a failing fetch renders
      the error and **not** fixture rows (`state/PipelineProvider.test.tsx`).
- [x] `vite.config.ts` proxy + `.env.example` for the dashboard; docs: `docs/BACKEND.md` § 8
      “calling it from the browser”, README quick start with two terminals.
- [x] Contract test in `services/api/test/contract.test.ts`: run the full 9-stage flow in-process,
      capture every response the dashboard consumes into `apps/dashboard/src/api/__fixtures__/`,
      and fail when the recorded shape stops matching the server. The dashboard's mapper tests
      read those files.
- [x] `scripts/check-bundle-secrets.mjs`: after `npm run build`, fail if the bundle contains
      `AEROSCRIBE_API_KEY`, a bearer token, or `SEMANTIC_SCHOLAR_API_KEY`.
- [x] `docs/IMPLEMENTATION_STATUS.md`: dashboard row → “Implemented (fixture data) / **live mode
      available**”; “Known limitations” loses the first bullet, gains “the deployed Pages build
      is fixture-only unless `VITE_API_URL` is set”.

**Status: done (PR #22, PR #23).** The contract, the client, the source abstraction, the proxy,
the bundle check and the contract test are in, and all nine views read live evidence through
mappers that refuse to invent what the payload omits: Overview, Pipeline, Literature, Novelty,
CFD, Manuscript, Review, Wiki and Settings. The live views are tested against
`apps/dashboard/src/api/__fixtures__/`, which the contract test writes from a real nine-stage
run, so a view that stops understanding the server fails a test. Acceptance items 1–5 hold.
C reuses the same route family (`…/references`), and B adds a `manuscript-render` panel to the
Manuscript view when it lands.

**Acceptance.**

1. Terminal 1 `npm run dev:api`; terminal 2 `npm run dev:dashboard`. A run created with `curl`
   appears in the dashboard within one refresh; expanding it shows real stage timings; approving
   GATE-0 from the UI advances the server (verified by `GET /api/v1/runs/:id`), and a second
   approve returns `409` and is displayed as such.
2. The Literature view shows the same references the API recorded, with the DOI for each, and no
   tag chips; the CFD view shows the GCI numbers from `cfd-run`, with the synthetic disclaimer
   visible when the run is synthetic.
3. Stopping the API and reloading shows `API unreachable` with the reason and zero fixture rows.
4. `VITE_API_URL` unset ⇒ the built dashboard says `Fixtures · illustrative data` on every view,
   exactly as today.
5. `scripts/check-bundle-secrets.mjs` passes on the live build.

**Risks.** Payload/view-model mismatch is the main one (mitigated by the table above and the
contract test); bundle size grows slightly (contract types are erased at build time).
**Rollback.** `VITE_API_URL` unset restores the current behaviour exactly.

**Size.** 5–6 days, plus 0.5 for the relevance field.

---

## 6. B — LaTeX source and PDF typesetting

**Why it matters.** “Submission package” currently means a manifest of hashes; a journal needs a
PDF. The dashboard's client-side `.tex` is unverifiable, unversioned and cannot include a
bibliography.

**Design — mirror the SU2 pattern exactly.** The toolchain is _detected, never assumed_; the
source is always produced; the PDF is produced only when a TeX binary exists; the absence is a
**blocker**, not a footnote.

```
services/api/src/latex/
├── render.ts       renderManuscript(manuscript, references, figures, journal) → { files }
├── escape.ts       escapeLatex() — one implementation, tested against adversarial input
├── bibliography.ts BibTeX entries from ReferenceRecord (P1)
├── figures.ts      pgfplots sources (G3)
├── toolchain.ts    detectLatex(binary) → { available, binary, version }
├── compile.ts      spawn with timeout, capture log, expect a PDF
└── index.ts        LatexService: render() always, compile() when available
```

- Template: the journal's `latexTemplate` (`packages/pipeline/src/journals.ts`) selects a
  preamble; unknown template ⇒ structured error, no guessing.
- Files produced: `manuscript.tex`, `references.bib`, `figure-N.tex`, `figure-N.dat`,
  `SIAM.bst`-free (use `plainnat`/`unsrtnat` shipped with TeX Live; document the dependency).
- Every generated `.tex` carries a header comment with the run id, generation time and the SHA-256
  of each input payload — provenance in the artefact, not only in the registry.
- **Claim verification runs on the rendered text**, not just on the JSON payload: strip LaTeX
  commands, run `verifyClaims` against the same policy. Numbers in the PDF are therefore bound
  to evidence by the same mechanism as the manuscript payload.
- Stage 8 gains a third artefact family and one new evidence kind, `manuscript-render`
  (writer: `knowledgeAndSubmission`), containing `{ texSha256, files, pdf: { sha256, bytes } | null,
typeset: 'pdf' | 'source-only', toolchain: { binary, version } | null }`.
- Stage 8 blocker added: `'the manuscript PDF was not typeset (LATEX_BINARY is not set)'`.
  A source-only package is a legitimate stage-8 _failure_, which is the honest outcome for a
  journal that requires a PDF.
- Endpoints: `GET /api/v1/runs/:id/manuscript.tex` (200, `text/x-tex`) and
  `GET /api/v1/runs/:id/manuscript.pdf` (200 `application/pdf`, or `503 capability_unavailable`
  naming `LATEX_BINARY`). Both read from the registry, so they cannot drift from the record.
- Config: `LATEX_BINARY` (absolute path, probed like `SU2_CFD_BINARY`), `LATEX_TIMEOUT_MS`
  (default 120000). `describeCapabilities()` gains `latex: { available, binary, version }`.

**Tasks.**

- [x] `escape.ts` + tests (`%`, `_`, `&`, `#`, `$`, `{`, `}`, `~`, `^`, `\`, Unicode dashes,
      a topic that is itself a LaTeX command).
- [x] `render.ts` producing a compilable document for both journal templates; deterministic
      output (same inputs ⇒ byte-identical `.tex`, asserted by hashing twice).
      The bibliography is written inline as a `thebibliography` list, so a document compiles with
      two `pdflatex` passes and no BibTeX run; `references.bib` is still emitted for the journal.
- [x] `bibliography.ts` from `ReferenceRecord`; entries never invent volume/pages (omit; add a
      `% missing: volume` comment so a reviewer sees what is absent).
- [x] `toolchain.ts` detection (`--version`, timeout, absolute path, executable bit) and
      `compile.ts` (two passes, captured log, non-zero exit ⇒ `UpstreamError` with log tail,
      missing PDF ⇒ same; a file that does not start with `%PDF-` ⇒ same).
- [x] `LatexService` wired into `buildServer` and stage 8; new kind in `EVIDENCE_KINDS`, dashboard
      mapper, `docs/BACKEND.md` § 3/§ 4/§ 8/§ 9.
- [x] Claim verification on rendered text; test with a number that is in no record ⇒ stage fails.
- [x] `npm run smoke:latex` script: renders, compiles when possible, prints every intermediate.
- [x] Fake-binary tests (mirroring `test/su2-http.test.ts`): success, non-zero exit, timeout,
      no PDF, and the `503` on the PDF endpoint when unset.
- [x] Dockerfile: `ARG INSTALL_LATEX=false`; when true install
      `texlive-latex-recommended texlive-pictures` (~250 MB, documented in `docs/BACKEND.md` § 9).
      The publisher class files and extra fonts are not installed because the rendered template is
      `article`-based with pgfplots; the smaller set is the one the generated source needs.
- [x] CI: job `latex`, which installs TeX Live and runs `npm run smoke:latex -- --require-pdf`,
      plus job `latex-without-engine`, which runs the same script with no engine and asserts the
      source-only outcome. Both jobs run on every push rather than a path filter: the renderer also
      depends on `packages/contract` and the pipeline's journal list, and a filter that misses one of
      those would hide exactly the regression these jobs exist to catch.
- [x] Integrity table RULE-030/032/033/041 rows and `IMPLEMENTATION_STATUS.md` “LaTeX compilation”
      row → **Implemented** (source always + PDF when a toolchain is present).

**Status: done.** `services/api/src/latex/` owns escaping, the two journal templates, the
bibliography, pgfplots figures, engine detection and compilation. Stage 8 renders before it
packages, appends one `manuscript-render` record (`texSha256`, per-file SHA-256, `pdf` or `null`,
`typeset`, `toolchain`) and pushes `render.blocker` into the submission blockers.
`GET /api/v1/runs/:id/manuscript.tex` and `…/manuscript.pdf` serve the recorded bytes, and the PDF
route answers `503 capability_unavailable` when no engine was configured. `npm run smoke:latex`
prints the whole chain, `--require-pdf` turns a missing PDF into a failure, and CI runs it both
with and without a TeX engine. `apps/dashboard` shows the file list, sizes and hashes, and links
the `.tex` (and the `.pdf` only when one exists). The acceptance below is tested in
`services/api/test/latex.test.ts`, `latex-http.test.ts` and `orchestrator.test.ts`; the one thing
this repository cannot test is a real engine's output, which the `latex` CI job covers on Linux
with TeX Live installed.

**Acceptance.**

1. With `LATEX_BINARY=/usr/bin/pdflatex`, a synthetic run produces `manuscript.pdf`, the record
   states `typeset: "pdf"` with the toolchain version, and the PDF opens.
2. Without it, the same run writes `manuscript.tex` (downloadable, compiles by hand on the
   reviewer's machine), `/manuscript.pdf` answers `503`, and stage 8 reports the blocker.
3. A generated `.tex` containing a topic with `_` and `%` fails to be produced only if escaping
   is broken — the escaping test suite is the guard.
4. `git diff` after regenerating the same run twice shows no changes (determinism).

**Risks.** TeX Live size in the image (mitigated: opt-in build arg, separate CI job); template
fidelity (we ship a _credible_ AIAA-style layout, not a publisher-certified class — the record
says which template was used and the note says it must be checked against the journal's current
guidelines).

**Size.** 4–6 days (excluding G3).

---

## 7. C — DOI re-verification for a stored manuscript

**Why.** A verification is a fact with a timestamp. Today it is only recorded implicitly at
generation time, so a manuscript stores “doi:…” with no evidence of when or where it resolved.
RULE-002 is enforced once and never again.

**Design — never mutate, always append.**

- `services/api/src/references/recheck.ts`:
  `recheckRun(runId, { literature, registry, clock })` reads the manuscript record, takes
  `ReferenceRecord[]` (P1), resolves each DOI through `LiteratureService.verifyDoi` with the
  expected title, and appends **one** `doi-recheck` evidence record:
  `{ runId, checkedAt, offline, results: [{ doi, status, reason?, provider?, titleSimilarity?,
previousVerifiedAt }], summary: { fresh, stale, broken, mismatch, unverified } }`.
- Statuses: `fresh` (verified now and previously), `stale` (last verified older than
  `AEROSCRIBE_DOI_MAX_AGE_DAYS`, default 30 — reported, not a failure), `broken` (no longer
  resolves), `mismatch` (resolves to a different title, similarity < 0.6), `unverified`
  (offline mode — never reported as verified).
- Endpoints:
  - `POST /api/v1/runs/:id/references/recheck` → `{ record, summary }` (201).
  - `GET /api/v1/runs/:id/references` → `{ references, checkedAt, rechecks, status }`, joining
    P1 records with the latest re-check.
- Stage 8 reads the latest re-check: any `broken`/`mismatch` adds a blocker; a missing re-check
  adds the blocker “references have not been re-verified in this run” only when the manuscript is
  older than the max age — otherwise the generation-time verification stands and is labelled
  `verifiedAt`.
- CLI `npm run recheck -- --run <id> | --all`, so a cron on the host from E can drive it without
  a queue. Documented as the only supported scheduling mechanism (no hidden background timers).

**Tasks.**

- [x] `recheck.ts` + pure `classifyVerification()` with unit tests for all five statuses.
- [x] `doi-recheck` kind: registry, orchestrator method, route, dashboard mapper, BACKEND § 4/§ 8.
- [x] Manuscript record gains `references[].verified.verifiedAt` (from P1) and the run's
      `references` route surfaces it.
- [x] Stage 8 blockers for `broken`/`mismatch`/stale; tests for each.
- [x] Offline mode returns `unverified` with the reason, never `fresh`; test asserts the word
      "verified" cannot appear for an offline recheck.
- [x] CLI + docs (`docs/BACKEND.md` § 6, and the cron example in § 14 — there is no
      `docs/OPERATIONS.md` yet; E creates it).
- [x] Integrity table RULE-002 → “API (generation-time + on-demand re-check; no scheduler)”.

**Status: done.** `services/api/src/references/recheck.ts` owns the classification and the single
append; `POST /api/v1/runs/:id/references/recheck` and `GET /api/v1/runs/:id/references` expose it;
`npm run recheck -- --run <id> | --all` is the cron entry point (exit `1` on `broken`/`mismatch`);
stage 8 reads the newest record; `apps/dashboard/src/api/mappers.ts` turns the payload into a
headline and per-reference rows, and the Manuscript view shows them. The acceptance below is
tested in `services/api/test/recheck.test.ts`: the manuscript payload is byte-identical across a
re-check, and exactly one record is appended.

**Acceptance.** With a fake provider that resolves a DOI on the first call and 404s afterwards:
generate a run, re-check, `GET .../references` shows `broken`, the registry verifies, the
manuscript payload is byte-identical to before the re-check, and exactly one new record exists.

**Size.** 2–3 days (after P1).

---

## 8. D — Postgres, Redis, S3

**Why.** Three separate limitations, three separate fixes, one shared prerequisite (ports).

| Limitation                                      | Today                                                | Fixed by                                       |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| One writer (registry file, `store/evidence.ts`) | two API instances corrupt the chain                  | **D2** Postgres + unique `seq` + advisory lock |
| Per-process rate limit and in-flight guard      | double budget and double stage runs across instances | **D3** Redis                                   |
| Artefacts on local disk (`cfd/su2.ts:184`)      | lost on redeploy; not shareable                      | **D4** S3                                      |

**D1 — ports (0.5–1 d).** `services/api/src/store/ports.ts` with `RunStore`, `EvidenceStore`,
`AuditStore`, `BlobStore` interfaces. Existing classes implement them unchanged; `Orchestrator`
and `createApp` depend on the interfaces. No behaviour change, all tests untouched. This is the
PR that makes D2–D4 reviewable.

**D2 — Postgres (4–5 d).**

```
runs(id text primary key, doc jsonb not null, created_at timestamptz, updated_at timestamptz,
     owner_sub text null)
run_options(run_id text primary key references runs(id), doc jsonb not null)
evidence(seq bigint primary key, id uuid not null unique, kind text not null,
         run_id text null, stage_id int null, label text, payload jsonb not null,
         payload_hash text not null, prev_hash text not null, hash text not null,
         created_at timestamptz not null default now())
audit(id bigserial primary key, at timestamptz not null, action text not null,
      run_id text null, actor text not null, detail jsonb)
schema_migrations(version text primary key, applied_at timestamptz not null)
```

- Append is a transaction: `SELECT pg_advisory_xact_lock(hashtext('aeroscribe.evidence'))`, read
  head hash, insert with `seq = head + 1` and the computed `hash`. The lock is what replaces the
  in-process queue; the unique `seq` is the backstop.
- Append-only is enforced **in the database**, not by convention:
  `CREATE TRIGGER evidence_append_only BEFORE UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE
FUNCTION raise_immutable()`; the application role gets `INSERT`/`SELECT` only.
- `verify()` walks `seq` ascending and recomputes; same semantics, same result shape, so the
  route and tests do not change.
- Migration runner: `npm run db:migrate` (`services/api/src/store/postgres/migrations/*.sql`,
  applied in order, transactional, recorded). `npm run db:verify` re-verifies the chain from
  outside the app — the operations tool of last resort.
- Import: `npm run db:import -- <dataDir>` reads existing NDJSON/JSON and inserts it **verbatim**
  (same `seq`, `prev_hash`, `hash`), then asserts the chain still verifies. A migration that
  changes a digest is a failed migration.
- Selection: `AEROSCRIBE_STORE=filesystem|postgres`, default `filesystem`. `postgres` without a
  URL fails at boot with one sentence; an unreachable database fails `/health` with
  `store: "postgres (unreachable)"` and refuses writes — no silent fall back to disk.

**D3 — Redis (1–1.5 d).** `AEROSCRIBE_COORDINATION=redis` + `AEROSCRIBE_REDIS_URL` select a
coordinator that keeps the rate-limit counter (`INCR` + `PEXPIRE` in one Lua script) and the
stage lock (`SET NX PX`, a heartbeat that extends only for the owner, and a Lua
compare-and-delete release) in Redis. `process` — the default, and the only correct choice for a
single instance — keeps them in memory and says so. Two half-configurations stop the process at
boot, exactly as `AEROSCRIBE_STORE`/`AEROSCRIBE_DATABASE_URL` do: the URL without the backend
would be a knob that does nothing, and the backend without the URL cannot work.

Explicit selection rather than "a URL means Redis": an operator who copies a `REDIS_URL` from a
compose file into a single-instance deployment should not silently acquire a network dependency
on the request path. `/health` reports `coordination: { backend, ok, detail }`, so the difference
is visible from outside.

**D4 — artefact storage (2 d).** Split in two, because the half that can be proved here is the
half the reader cares about.

_D4a — done._ A content-addressed `BlobStore` (`services/api/src/blob/`), the evidence payload
carrying `{ name, sha256, bytes, mediaType }`, and
`GET /api/v1/evidence/:seq/artefacts/:name`, which streams the bytes **after** re-hashing them
and answers `409 artefact_hash_mismatch` when they no longer match the record. Storage is local
in every mode: `<dataDir>/blobs/sha256/<aa>/<rest>`, written with an atomic rename, never
overwritten under a live digest.

_D4b — not started._ `AEROSCRIBE_S3_BUCKET`, `AEROSCRIBE_S3_ENDPOINT` (MinIO),
`AEROSCRIBE_S3_REGION`, credentials from the standard `AWS_*` chain: an adapter behind the same
`BlobStore` port, and — when S3 is configured — deleting the working copy after upload. Two
things are missing before it can be written honestly: an S3 endpoint to test `409` against
(`dl.min.io` is unreachable from this environment and there is no Docker daemon for a service
container), and a decision about whether a shared bucket replaces or mirrors the local copy.

**Tasks.**

- [x] D1 ports + adapter names (`FilesystemRunStore`, …) and a `store` factory.
- [x] D2 schema, migrations, three stores, `db:migrate`, `db:verify`, `db:import`, trigger.
- [x] D3 Redis limiter and run lock; `/health` reports both.
- [x] D4a blob store, artefact endpoint, size and media type on recorded artefacts.
- [ ] D4b S3 adapter behind `BlobStore` and the `uri` on `cfd-run` artefacts.
- [x] **Contract suite**: `services/api/test/store-contract.test.ts` runs the same scenarios
      against every configured backend (create/get/list, append/verify, tamper detection,
      concurrent appends from two clients, audit read), on filesystem and Postgres.
- [x] CI: the Postgres suite runs in the ordinary `api` job. It needs no service container —
      `embedded-postgres` (a dev dependency) starts real Postgres binaries in a temporary
      directory — and `AEROSCRIBE_TEST_DATABASE_URL` points the same harness at an external
      server, so a compose stack and CI run identical tests. A mock was not an option: the
      advisory lock, the trigger and `jsonb` round-trips are the behaviour under test.
- [x] CI: `services: redis:7` in both jobs that run the suite, with
      `AEROSCRIBE_TEST_REDIS_URL` and an explicit reachability check — the coordination tests
      are only meaningful against a real server, so a silent skip would hide a failure. Locally
      the harness starts a `redis-server` from `PATH` (or `AEROSCRIBE_REDIS_SERVER`) and skips
      with a named reason when neither exists.
- [ ] `.github/workflows/ci.yml`: `services: minio` once D4 exists.
- [ ] `compose.yaml` (shared with E) so the same stack runs on a laptop.
- [x] Docs: `docs/BACKEND.md` § 9 rewritten (store matrix, `/health`, Postgres, migration),
      new `docs/OPERATIONS.md` (run, migrate, verify, import, restore, rotate keys, recheck
      cron, incident runbook, what is not built), integrity table RULE-011/043/044 rows
      re-worded, `IMPLEMENTATION_STATUS` persistence row.

### Status of D

**D1, D2, D3 and D4a are done. D4b (object storage) is not started.**

**D1 — ports.** `services/api/src/store/ports.ts` defines `RunStore`, `EvidenceStore` and
`AuditStore`; `createStores()` is the only place an adapter is chosen, and the orchestrator,
the stage context and the HTTP layer take the ports.

**D2 — Postgres.** `services/api/src/store/postgres/` holds the schema
(`migrations/001_initial.sql`), the migration runner, the three stores, an importer and the
pool/error classification. What it guarantees, each with a test that fails if it stops being
true:

- An append is one transaction holding `pg_advisory_xact_lock`, so two instances keep one
  chain; `seq` is the primary key as the backstop. Two writers × 50 appends produce 100
  linked records that both instances verify.
- `UPDATE`, `DELETE` and `TRUNCATE` on `evidence` are refused **by the database**, each
  caught by the trigger's own message.
- The chain algorithm is shared with the filesystem adapter (`store/chain.ts`), so
  "verifies" cannot mean two things; the contract suite proves both adapters return the same
  verdict for the same tampering.
- `db:migrate` is idempotent, `db:verify` recomputes the whole chain over a separate
  connection, and `db:import` copies a filesystem deployment verbatim, verifies it, and
  refuses to merge two chains.
- `AEROSCRIBE_STORE=postgres` without a URL stops the process at boot; an unreachable
  database makes `/health` answer `503` and every write return `503 store_unavailable` with
  **no file created on disk**. The database password is redacted from every report.

**D3 — Redis.** `services/api/src/coord/` holds the port (`Coordinator`), the in-process
implementation and the Redis one. What it guarantees, each with a test in
`services/api/test/redis.test.ts` that fails if it stops being true:

- **One budget between instances.** The 61st request across two apps sharing one Redis is the
  one that gets `429` with `x-ratelimit-remaining: 0`. The count is `INCR` + `PEXPIRE` in a
  single script, so two instances cannot both spend the last request in a window.
- **One stage per run.** `SET NX PX` claims the run; a second instance's `advance` gets `409`
  before anything runs — no evidence appended, no stage marked started. A heartbeat extends the
  lease only for its owner and release is a compare-and-delete, so an instance that overruns
  its lease cannot delete the winner's lock when it finally returns.
- **An outage is reported, not papered over.** A Redis that cannot be reached makes the limiter
  answer `503 coordination_unavailable` and `/health` answer `503`; it never falls back to a
  local counter that would make the limit look enforced.

**D4a — artefact bytes.** Stage 4 stores the bytes it hashed (`blobs/sha256/<aa>/<rest>`), and
`GET /api/v1/evidence/:seq/artefacts/:name` re-hashes them before serving. A record whose bytes
are gone says so; a file that no longer matches its digest answers `409` with both digests and
no body. Verified against the synthetic solver's real artefacts in `artefacts-http.test.ts`.

**Why D4b is not here.** MinIO's installer fetches from `dl.min.io`, which this environment
cannot reach, and there is no Docker daemon for a service container. The S3 adapter is the one
part of D4 whose behaviour — signing, key layout against a real server, a `409` on altered
object storage — cannot be exercised here, and an untested adapter is a claim. `BlobStore` is
the seam it will slot into; nothing outside `createBlobStore` changes.

**Acceptance (D2, D3 and D4a met; the S3 half of item 5 remains).**

1. **Met.** The contract suite is green on both backends, and `postgres.test.ts` runs two
   connections appending 50 records each into one chain that a second reader verifies.
2. **Met.** `UPDATE evidence SET payload = …` fails with `the evidence registry is
append-only: UPDATE on evidence is not permitted`; so do `DELETE` and `TRUNCATE`.
3. **Met.** With the database stopped, `/health` answers `503` naming the unreachable
   database, `/api/v1/runs` answers `503 store_unavailable`, and the data directory is
   still empty.
4. **Met.** `redis.test.ts` runs two apps over one Redis: requests 1–60 alternate between
   them and all return `200`, the 61st returns `429`. A lease taken by one instance makes the
   other's `advance` answer `409` with nothing written; after release the same call proceeds.
5. **Partly met.** The round trip and the `409` hold against the local content-addressed
   store: `artefacts-http.test.ts` stores a stage's real artefacts, fetches each one, re-hashes
   it against the digest in the record, then flips a byte on disk and asserts the endpoint
   answers `409` with both digests and no body. The **MinIO** half is not met: there is no S3
   server to test against here, and a fake would prove only that the fake works.

**Risks.** Dual-store support doubles the surface for a while (mitigated by the contract suite,
which is written first, D1); Postgres advisory locks are a bottleneck under very high write rates
— irrelevant at this scale, stated in the docs; `pg` and `ioredis` are two new runtime
dependencies (`@aws-sdk/client-s3` would be the third; see §12 and §14).

**Rollback.** `AEROSCRIBE_STORE=filesystem` and `AEROSCRIBE_COORDINATION=process` restore
single-instance behaviour, and empty S3 settings keep artefacts local;
`db:import` is one-way, so the rollback procedure is “keep writing files until the import is
verified”, documented in `OPERATIONS.md`.

**Size.** 8–10 days total (D1 1, D2 5, D3 1.5, D4 2).

---

## 9. E — Publish the image, add a staging environment 🟡 written, not run

**Why.** RULE-063 says no auto-deploy to production. That rule cannot be satisfied by a
repository that deploys nothing: the previous state was "no production at all", which is honest
but not the property the rule describes.

**Design, as built.**

- **Publishing.** `.github/workflows/release-api.yml` on tags `v*` and `workflow_dispatch`:
  `docker/build-push-action` → `ghcr.io/<owner>/aeroscribe-api` with semver, `sha-…` and `latest`
  tags; `platforms: linux/amd64,linux/arm64`; `provenance: true`, `sbom: true`;
  `permissions: packages: write`. `AEROSCRIBE_VERSION` and `GIT_SHA` are build arguments the
  image stamps into its environment, so `/health` reports the release it is.
  **Changed from the sketch:** the workflow publishes a second image,
  `aeroscribe-dashboard`, because a deploy should pull an immutable bundle rather than compile the
  dashboard on the host. A job `verify` then boots the published **digest** and runs the smoke
  script — a tag whose image cannot pass its own smoke is not a release yet.
- **Environment split.** Two GitHub Environments: `staging` (self-service) and `production`
  (required reviewers, restricted branches). The rule lives in repository settings, and
  [`DEPLOYMENT.md`](DEPLOYMENT.md) § 5 records exactly which toggles to set, because a workflow
  file cannot turn a reviewer gate on by itself.
- **Where it runs.** Self-hosted compose over SSH — the default the plan chose, needing no account
  beyond the host. Render/Fly and Kubernetes stay recorded as decisions in
  [`DEPLOYMENT.md`](DEPLOYMENT.md) § 12.
- **`compose.yaml`** (also the local dev stack): `api`, `postgres`, `redis`, `migrate`, `caddy`
  (TLS + reverse proxy serving the live dashboard bundle at `/` and `/api` to the API). Same-origin
  removes CORS entirely, and the bearer token is injected at the edge, so the browser never holds
  it. **One deviation from the sketch:** there is no `minio` service. The API has no
  object-storage adapter (D4b is unbuilt), and a bucket nothing talks to is worse than an absent one;
  artefact bytes are the `api-data` volume. `migrate` is a one-shot service rather than an inline
  migration, because `AEROSCRIBE_STORE=postgres` refuses to boot against an empty database and a
  request-handling process should not change the schema.
- **Post-deploy smoke.** `scripts/smoke-deploy.sh <base-url>`: `/health` reports the expected
  version, auth and solver state; create a run with `solver: "synthetic"`; walk every gate; assert
  stage 8 is **blocked** and names the synthetic solver; assert the `cfd-run` record's solver
  matches; assert `/api/v1/evidence/verify` is `valid`. A deploy that breaks a label fails the
  deploy. It is run by `release-api.yml` (against the published digest) and by both deploy
  workflows.

**Tasks.**

- [x] `release-api.yml` with GHCR publish, multi-arch, SBOM, provenance; `AEROSCRIBE_VERSION` and
      `GIT_SHA` build args surfaced in `/health`; a `verify` job that boots the digest under smoke.
- [x] `compose.yaml` + `docker/Caddyfile` + `.env.example` for the stack, plus
      `docker/dashboard.Dockerfile` and the one-shot `migrate` service.
- [x] `deploy-staging.yml` (dispatch, `environment: staging`) — SSH-to-compose, with the required
      secrets and variables listed in [`DEPLOYMENT.md`](DEPLOYMENT.md) § 5.
- [x] `deploy-production.yml` (dispatch only, `environment: production`, required reviewers) — never
      triggered by a push, plus a `confirm` input that must equal the tag and optional digest pinning.
- [x] `scripts/smoke-deploy.sh` + run it in the staging workflow; a failure blocks promotion.
- [x] `DEPLOYMENT.md`: topology, secret list, TLS, backup/restore, rollback to a previous tag,
      environment-protection setup steps, and the explicit sentence that GitHub Pages hosts the
      **fixture-only** dashboard.
- [x] Integrity table RULE-063 → **Process** (environment protection) instead of N/A.

### Status of E

**Every artefact exists. The half that needs Docker or a host has never executed.**

**Executed here, with the output in the pull request that added this section.** `scripts/smoke-deploy.sh` against a real API, anonymous
and keyed; it fails on a wrong `--expect-version`, a wrong `--expect-auth`, a wrong `--expect-solver`
and a 401 without a key, and passes with `stage 8 blocked and names the synthetic solver`. The same
script over HTTPS against a self-signed certificate: `TLS verification failed`, exit 1, and a full
pass with `--insecure`. The same-origin arrangement was exercised against a stand-in for the Caddy
rules: `/api/v1/runs` with no `Authorization` header returns `200` through the edge and `401` when
called directly, the live bundle's emitted URLs are relative, and a deep link falls back to
`index.html`. `services/api/test/deploy-config.test.ts` compares `compose.yaml` to `config.ts`, to
`.env.example` and to the Caddyfile, and asserts that nothing but the edge publishes a port — so a
renamed variable or a published `8787` fails the suite rather than production. Every `run:` block in
the three workflows is parsed and passed to `bash -n`.

**Not executed.** The GHCR publish (there is no Docker daemon in this environment, so the multi-arch
build, the SBOM and the provenance attestation are unproven); `docker compose up` and therefore every
claim about Caddy, Postgres, Redis and the TLS handshake; `Deploy to staging` and
`Deploy to production`, including the SSH path, the pinned host key and the digest check; and the
`production` environment's required reviewers, which is repository configuration rather than
something a file can demonstrate. These are recorded as written-not-run, the same way D4b is.

**Acceptance, item by item.**

1. _A tag `v0.3.0` publishes a multi-arch image with an SBOM._ **Written, not run.** The workflow
   builds two images for `linux/amd64,linux/arm64` with `sbom: true` and `provenance: true`, and
   refuses any ref that is not a `v*` tag on main. No tag has been pushed from this environment.
2. _`docker compose up` brings the stack to a state where the dashboard lists live runs._ **Not
   demonstrated; the mechanism is.** The stack is defined, the live bundle is same-origin and its
   API calls are proven at the HTTP level, and the nine live views are covered by 22 component
   tests. No Docker daemon here, and no browser-driven end-to-end test exists anywhere in the
   repository — which is why [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) still says the
   deployed Pages build is fixture-only.
3. _A staging deploy is followed by a green smoke proving the stage-8 blocker._ **The smoke half is
   proven against a real API; the deploy half is unexecuted.** The staging workflow's last step is
   that exact script, so a deploy cannot be reported green without it.
4. _A production deploy cannot start without a reviewer._ **Configuration, not code.** The workflow
   is dispatch-only and declares `environment: production`; GitHub withholds the environment's
   secrets until the required reviewers approve. With that toggle off the promise is empty, which is
   why [`DEPLOYMENT.md`](DEPLOYMENT.md) § 5 spells out the two settings that make it true.

**Size.** 3–5 days, plus whatever the chosen host costs.

---

## 10. F — Accounts

**Why.** Two problems, not one: there is no way to tell users apart, **and** the audit trail
records whatever `actor` string the caller typed (`http/app.ts:160`). The second is an integrity
defect hiding behind the first.

**Design.**

- `AEROSCRIBE_AUTH=none|token|oidc` (default `none`, reported in `/health`). `token` keeps
  today's behaviour for scripts; `oidc` is the real mode.
- OIDC Authorization Code + PKCE. The API only **validates** tokens: `OIDC_ISSUER`,
  `OIDC_AUDIENCE`, JWKS fetched and cached, `jose` for verification, clock skew 60 s. No
  passwords, no sessions table, no password reset surface to get wrong.
- Identity: `users(sub text primary key, email text, name text, role text, created_at)` with
  roles `researcher | reviewer | admin`, assigned by an admin (`AEROSCRIBE_ADMIN_SUBS`), never
  self-declared. `AEROSCRIBE_AUTH=oidc` requires the Postgres store (D2).
- Authorization: runs gain `owner_sub`. Read/advance/approve allowed for the owner; `reviewer` may
  read and approve gates on any run; `admin` may do everything. `403` with the role it required.
- **Audit integrity:** `actor` becomes `user:<sub>` derived from the verified token — never from
  the request body. The body's `actor` field is ignored in `oidc` mode and documented as
  “display name only in `none`/`token` mode”. A test asserts that a body claiming
  `actor: "someone-else"` cannot change the recorded actor.
- Rate limiting keyed by subject when authenticated.
- Dashboard: `apps/dashboard/src/auth/` — PKCE redirect, access token in memory only, refresh
  through an `HttpOnly`, `SameSite=Lax` cookie issued by a small `/auth/refresh` endpoint;
  first-party because E serves the dashboard and the API from one origin. Login screen, 401 →
  re-login, role-aware gate buttons (“reviewer approval”).

**Tasks.**

- [x] `services/api/src/auth/{oidc,token,principal}.ts`, middleware replacing the single-key
      check, `GET /api/v1/me`. (`index.ts` holds the token mode and the factory; `policy.ts` holds
      the table.)
- [x] Users table + migration; ownership on the run document; authorization checks in the HTTP
      layer with a test matrix (owner / other / reviewer / admin × read / advance / approve).
- [x] Audit actor derived from the principal; test for spoof rejection.
- [ ] `/auth/refresh` route + cookie handling; CORS `credentials: true` only in that mode.
      **Not built — see the deviation below.**
- [x] Dashboard auth module, login, role-aware UI, token never in `localStorage` (it is in
      `sessionStorage`, which dies with the tab).
- [x] Tests: local JWKS fixture (generated keypair, real HTTP, no network), expired token, wrong
      audience, wrong issuer, forged signature, `HS256` confusion, unreachable issuer ⇒ `503`. An
      unknown `sub` is not a `403`: it creates a `researcher` account on first login.
- [x] Docs: `docs/BACKEND.md` § 8/§ 9, `SECURITY.md` threat model, `IMPLEMENTATION_STATUS`
      Authentication row → **Implemented (OIDC)** with the token mode noted as a script fallback.
- [x] Integrity table RULE-004/040 rows mention the principal-derived actor.

**Acceptance.** Two accounts: A creates a run and approves GATE-0; B gets `403` on approve and
`200` on read only if reviewer. The audit entry for A's approval says `user:<A-sub>`, and a request
that claims `actor: "B"` still records A. Expired token ⇒ `401`, dashboard redirects to login.

**Size.** 5–7 days (after D2 and A).

### Status of F

**The server half is implemented and executed end to end against a real issuer over real HTTP. The
browser half is implemented and unit-tested; no real identity provider and no browser have been
involved.**

**Executed.** `services/api/test/support/idp.ts` is a real issuer: a real RSA keypair, a real
discovery document and a real JWKS served over loopback HTTP, and tokens signed by the same library
the API verifies with. Against it, 19 tests pin the verdicts that matter — valid, expired, no `exp`,
wrong `aud`, wrong `iss`, a signature from a key the issuer never published, an unknown `kid`, the
`HS256`-with-the-public-key confusion attack, a non-token, an unreachable discovery document
(`503 auth_unavailable`, not `401`), a JWKS endpoint answering `500` (also `503`), and a discovery
document that names another issuer (also `503`). A further 17 tests drive `createApp` with a real
`FilesystemUserStore` and real signed tokens: A creates a run and approves GATE-0 while the request
body claims `actor: "somebody-else"`; the audit entry says `user:user-ana` and no entry says
`somebody-else`; B — a researcher — is refused `403` on read and approve while the gate is still
pending; promoted to `reviewer`, the same B approves A's gate and is still refused `run:advance`;
`/users` is `403` for a researcher and a list for an admin; demoting yourself is `409
self_demotion`; the rate limit is spent per subject; `token` mode behaves exactly as before.

Fifteen further tests in `config-auth.test.ts` pin every boot decision — a mode it cannot
implement, a key no mode would check, an issuer without an audience, a plain-HTTP issuer (refused
unless loopback), a shared key beside an issuer, and the `/health` answer each mode produces.

The same was then run as **a process**, not a test: `AEROSCRIBE_AUTH=oidc` against the loopback
issuer, a minted access token, and `scripts/smoke-deploy.sh --expect-auth-mode oidc`, which created
a run, advanced it through all nine stages, approved every gate as `user:user-smoke`, and finished
with `stage 8 blocked and names the synthetic solver`. `/api/v1/me` reported `role: admin` from
`AEROSCRIBE_ADMIN_SUBS`, `/api/v1/audit` recorded `user:user-smoke`, and an anonymous `/api/v1/runs`
answered `401`. Without a token the smoke exits **4 — PARTIAL** and says which checks did not run;
with `--expect-auth-mode token` against an `oidc` deployment it fails with both modes named.

Storage: the `users` port is exercised against both adapters by the shared contract suite —
first-login creation, a display-name change that leaves the role alone, promotion from the
deployment's admin list, no demotion at login, demotion only through `setRole`, and the same order
from both backends.

Dashboard: `apps/dashboard/src/auth/` implements Authorization Code + PKCE (S256 challenge from the
verifier, `state` checked on the callback, verifier consumed and never in the URL, no client
secret), a session in `sessionStorage` with a 30-second expiry margin, an `AuthGate` that redirects
to the issuer and handles the callback, and role-aware pipeline buttons. 25 unit tests pin the
challenge against RFC 7636's worked example, the authorize URL, the token request's form body, a
state mismatch, a replayed callback, the expiry margin and the role matrix. A `401` from any request
clears the session and starts a new login — the acceptance sentence, as code.

**Deviations from the plan above, stated rather than quietly taken.**

1. **No `/auth/refresh`, no `HttpOnly` cookie, no refresh token.** The access token is held in
   `sessionStorage` and expiry re-runs the login. A refresh endpoint needs a server-side session or
   consent record, and a cookie-authenticated endpoint is a CSRF surface with its own test burden;
   the acceptance case only requires the redirect, which is what is built. Recorded as unbuilt, not
   as done.
2. **No `runs.owner_sub` column.** Ownership is `PipelineRun.ownerSub` inside `runs.doc`, which has
   one write path. The rationale is in the header of `002_users.sql`; a column becomes worthwhile
   when "list my runs" is a query rather than a filter.
3. **`oidc` does not require Postgres.** The `users` port has a filesystem adapter (an append-only
   `users.ndjson`, folded on read) as well as the Postgres table, so a laptop can run accounts
   without a database.
4. **The default mode is derived, not `none`.** `AEROSCRIBE_AUTH` unset still means "`token` when
   `AEROSCRIBE_API_KEY` is set, else `none`", so every existing deployment keeps working and every
   existing test config needed no edit.

**Not executed.** No real identity provider (Keycloak, Entra, Auth0, GitHub) has been contacted, and
no browser has performed a PKCE round trip — the sandbox has neither. The dashboard's flow is tested
against an injected `fetch` that asserts the request it would send; that proves the wire format, not
that a particular vendor accepts it. There is still no browser-driven end-to-end test in this
repository.

**Acceptance, item by item.**

1. _A creates a run and approves GATE-0._ **Proven**, in tests and in a running process.
2. _B gets `403` on approve, and `200` on read only if reviewer._ **Proven**, for both roles.
3. _The audit entry says `user:<A-sub>`, and a body claiming `actor: "B"` still records A._
   **Proven** — in the test and in the process (`user:user-smoke`).
4. _Expired token ⇒ `401`, dashboard redirects to login._ **The `401` is proven; the redirect is
   unit-tested and never ran in a browser.** `AuthGate` clears the session and navigates to the
   issuer's authorize endpoint on the first `401`; no IdP exists here to complete that journey.

---

## 11. G — RULE-030, RULE-032, RULE-033

These are three separate rules; the plan keeps them separate even though they ship together.

### G1 — Hierarchical manuscript generation (RULE-030)

**Design.** The writer stays deterministic; the hierarchy becomes a typed artefact rather than a
claim about prompting.

```ts
export interface ManuscriptPlan {
  stage: 'plan';
  schemaVersion: 2;
  sections: Array<{
    heading: string;
    purpose: string;
    paragraphs: Array<{
      id: string; // `p-<section>-<n>`
      intent: string;
      evidenceRefs: string[]; // record ids this paragraph may cite
      numberKeys: string[]; // keys of ManuscriptPayload.numbers it may print
      targetWords: number;
    }>;
  }>;
}
```

- Stage 5 writes `manuscript-plan` (new kind, writer: `paperSynthesis`) **before** rendering, then
  renders only from the plan: every paragraph's text is produced from its `intent` and its
  declared numbers. Plan and text cannot disagree because text is a projection of the plan.
- Stage 6 (review) checks the projection: every planned paragraph id appears in the manuscript,
  every number printed has a `numberKeys` entry, and no paragraph exceeds its `targetWords` by
  more than 20 %. Failures are review findings, and any `major` finding makes the verdict
  `revise` — which already blocks stage 8 via the review-verdict compliance issue.
- `ManuscriptPayload` gains `planRef: { seq: number; hash: string }`, so the text is bound to the
  plan that produced it.

**Tasks.**

- [x] `services/api/src/agents/plan.ts`: `buildPlan(records, journal)` — deterministic, no
      randomness, ordered by `journal.sectionOrder`.
- [x] Stage 5 renders from the plan; `manuscript-plan` kind wired end to end (registry, mapper,
      docs, contract test).
- [x] Stage 6 projection checks + tests (missing paragraph, undeclared number, overlong
      paragraph).
- [x] Docs: `docs/BACKEND.md` § 3 stage 5/6; integrity table RULE-030 → **API (projection
      checked)**; note that this is _not_ an LLM hierarchy.

**Size.** 2 d.

### G2 — AIAA citation formatting (RULE-032)

**Design.** `services/api/src/agents/citation.ts`:

```ts
export interface FormattedCitation {
  text: string;
  style: 'aiaa-journal' | 'aiaa-book' | 'aiaa-conference' | 'incomplete';
  missing: string[]; // fields the record does not carry
}
export function formatAiaa(reference: ReferenceRecord): FormattedCitation;
export function parseAiaa(text: string): ParsedCitation | null; // for the round-trip check
```

- Journal: `[N] A. Author and B. Author, "Title," Journal, Vol. V, No. N, YYYY, pp. P–P. doi:…`
- Conference: `[N] A. Author, "Title," Proceedings Name, Publisher, YYYY, pp. P–P.`
- Book: `[N] A. Author, Title, Publisher, City, YYYY, pp. P–P.`
- Authors beyond three become `et al.`; missing fields are **omitted**, never invented, and listed
  in `missing`.
- `CitationValidator` in stage 5: format each reference, parse it back, and fail if the round-trip
  loses a field that was present. Compliance (stage 7) gains a `citation-format` issue: `major`
  when the formatter returns `incomplete` for a field the journal requires, `minor` otherwise.
- `agents/writing.ts:formatCitation` delegates to `formatAiaa`; the existing `[n]` prefix check in
  `review.ts:213` becomes a secondary assertion.

**Tasks.**

- [x] `citation.ts` + table-driven tests for the three forms, `et al.`, missing volume/pages,
      Unicode names, a DOI with a trailing slash.
- [x] Round-trip validator + stage 5 wiring.
- [x] Compliance rule + tests; `citation` string in the manuscript payload produced by the
      formatter.
- [x] Integrity table RULE-032 → **API**; `IMPLEMENTATION_STATUS` manuscript row notes the style.

**Size.** 1.5 d.

### G3 — pgfplots figures (RULE-033)

**Design.** `services/api/src/latex/figures.ts` — pure functions from GCI data to `.tex` + `.dat`:

- One figure per CFD series: `figure-gci.tex` with two panels (`value vs cells`, `GCI vs cells`),
  `\addplot table {figure-gci.dat}`, axis labels carrying SI units from the payload, a legend when
  more than one series exists, and a caption that names the run and the artefact SHA-256.
- Header comment: `% provenance: run <id>, evidence seq <n>, sha256 <hash>`.
- No `\includegraphics`, no binary assets: text in, text out, diffable in review.
- Determinism: same evidence ⇒ byte-identical `.tex` and `.dat` (test hashes twice).
- If the study is invalid, the figure is still rendered but its caption says so in one sentence
  (“the grid study did not reach the asymptotic range; the interval is not reported”).

**Tasks.**

- [x] `figures.ts` + tests on generated source (axis labels, units, legend presence/absence,
      caption hash, determinism, invalid-study caption).
- [x] Wired into `render.ts` (B) so figures are included in the manuscript.
- [x] Integrity table RULE-033 → **API** (source generated and checked; compilation depends on the
      toolchain from B).

**Size.** 1.5 d.

### Status of G

**All three rules are implemented and executed. RULE-030 is still deliberately _not_ an LLM
hierarchy: the plan is a typed record written before the text, and stage 6 checks the text
against it.**

**G1 — the plan is a record, not a prompt.** Stage 5 now writes two records in order: a
`manuscript-plan` and the `manuscript` that names it through `planRef = { seq, hash }`.
`agents/plan.ts` builds the plan deterministically from the evidence the run already holds —
sections in `journal.sectionOrder`, each paragraph carrying an id (`p-results-2`), an intent,
the evidence records it may draw on (`cfd-run#6`) and the number keys it may print. Rendering
goes through `renderPlan`, where a paragraph asks for a number by key and the renderer throws
if the key was not declared, so an undeclared number cannot reach the text in the first place.
Stage 6 then compares the two records. Eleven unit tests drive `checkProjection` over the text
the plan produced, a missing planned paragraph, an unplanned one, an undeclared number (and the
same number rounded to fewer digits, which passes), a declared key the numbers table does not
carry, an overlong paragraph, a `planRef` that does not resolve / points at another kind / lies
about the hash, and a pre-plan manuscript; six more drive stage 6 end to end over a manuscript
stage 5 actually wrote and then tampered with. The
missing/undeclared/`planRef` findings are `major`, so the verdict becomes `revise` and stage 8
stays blocked; an overlong paragraph is `minor`, because length is a budget rather than a claim;
and a pre-plan manuscript is recorded as `skipped`, never as a pass.

**G2 — AIAA citations, checked by inverting them.** `agents/citation.ts` sets the journal,
conference and book forms from the structured record, collapses four or more authors to three
and `et al.`, prints DOIs without a resolver prefix or trailing slash, and lists every field
the form omits in `missing`. `validateCitations` formats each entry, parses it back and fails
the stage if a printed field was lost; 21 tests cover the three forms, the `et al.` boundary,
missing volume and pages, Unicode names, a single-page entry, a DOI with a trailing slash, the
`incomplete` style for a legacy record, and the one input that genuinely cannot round-trip (an
author name containing a comma), which fails loudly instead of producing a wrong citation.
Stage 7 adds a `citation-format` issue: `major` when the formatter could not set a reference,
`minor` when it only omitted optional fields, absent when the payload predates citations.

**G3 — figures as diffable source.** `figure-gci.tex` + `figure-gci.dat`: two pgfplots panels,
labels taking quantity and unit from the payload, `nan` where no GCI is reported, and a header
(`% provenance: run <id>, evidence seq <n>, sha256 <hash>`) plus a caption that repeat the run,
the record and the artefact digest. No `\includegraphics` anywhere. Rendering the same record
twice produces byte-identical files, which the suite asserts rather than assumes.

**Deviations from the plan above, stated rather than quietly taken.**

1. **The plan ships at `schemaVersion: 1`, not 2.** The sketch above said 2; the kind is new in
   G, and numbering a first version 2 would imply a version 1 that never existed.
2. **Free text is quoted only when it carries no numeral.** Solver notes, disclaimers and
   rejection reasons that contain digits stay in the `cfd-run` record instead of being copied
   into prose: a paragraph's numbers must all be declared keys, and free text cannot be
   declared. The rejection reason is still quoted by stage 6's own comment, where it belongs.
3. **The abstract is not a planned section.** It has no heading to attach a paragraph id to, so
   the plan covers the numbered sections plus the disclosure; the abstract is still verified
   and length-checked. Stated here rather than left to be discovered.
4. **An invalid study draws one panel, not two.** The value panel is still plotted (the mesh
   values are real evidence) and the caption says in one sentence that the study did not reach
   the asymptotic range and no interval is reported; an empty GCI axis would suggest a study
   that produced GCI where none did.
5. **The legend exists only for a multi-series figure, and production always passes one
   series.** `figureFromSeries` is what the multi-series test exercises; `cfdFigure` is the
   single-study wrapper the pipeline uses.
6. **`ManuscriptPayload` stays at `schemaVersion: 2`.** `planRef`, `citations` and per-section
   `paragraphs` are additive; per BACKEND § 6 a field that is added does not bump a version.
   Records written before G simply lack them, and every reader treats absence as "before G",
   never as "lost".

---

## 12. Milestones, exit criteria

| Milestone                    | Scope                        | Exit criterion (demonstrable)                                                                                                                             | Days |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **M0 Foundations**           | P1, payload versioning, H, I | A run's records carry structured references and `schemaVersion`; logs are JSON with `run_id`; ADR merged; full gate green.                                | 4–5  |
| **M1 Live dashboard**        | A                            | A stranger runs two terminals and drives a real run from the UI; API down ⇒ error, not fixtures; no secret in the bundle.                                 | 6–7  |
| **M2 Typeset manuscript**    | B, G3                        | Synthetic run ⇒ real `.tex` with pgfplots figures; with a TeX binary, a PDF; without, a named blocker and a `503` on the PDF route.                       | 6–8  |
| **M3 Reference integrity**   | C, G1, G2                    | Re-check flips a DOI to `broken`, the manuscript is unchanged, stage 8 blocks; citations are AIAA-formatted; plan ↔ text projection verified.             | 6–8  |
| **M4 Service-grade storage** | D                            | Contract suite green on filesystem **and** Postgres; two instances share Redis limits and locks; artefacts round-trip through S3 with tamper detection.   | 8–10 |
| **M5 Deployable**            | E                            | Tagged multi-arch image with SBOM; `docker compose up` serves a live dashboard; staging smoke proves the stage-8 blocker; production requires a reviewer. | 3–5  |
| **M6 Accounts**              | F                            | Two users, real 403s, audit actor derived from the token, spoof attempt recorded as the real user.                                                        | 5–7  |

**Indicative PR sequence** (each row is one reviewable PR; dependencies are the column before):

| #   | PR                                                                             | Depends on |
| --- | ------------------------------------------------------------------------------ | ---------- |
| 1   | `feat(api): version evidence payloads and structure references` (P1)           | —          |
| 2   | `feat(api): structured JSON logs with request and run correlation` (H)         | —          |
| 3   | `docs(adr): why the writer is deterministic, and what RULE-022 would need` (I) | —          |
| 4   | `feat(contract): share wire types between the API and the dashboard`           | 1          |
| 5   | `feat(dashboard): read runs, gates and evidence from the API`                  | 4          |
| 6   | `feat(dashboard): migrate every view to the run source`                        | 5          |
| 7   | `feat(api): render LaTeX and compile a PDF when a toolchain exists` (B)        | 1          |
| 8   | `feat(api): pgfplots figures from grid-study evidence` (G3)                    | 7          |
| 9   | `feat(api): re-check manuscript DOIs and record the result` (C)                | 1          |
| 10  | `feat(api): manuscript plan and AIAA citations` (G1+G2)                        | 1          |
| 11  | `refactor(api): storage ports and a store factory` (D1)                        | —          |
| 12  | `feat(api): Postgres store with an append-only ledger` (D2)                    | 11         |
| 13  | `feat(api): Redis rate limit and run lock` (D3)                                | 11         |
| 14  | `feat(api): S3 artefact store and download endpoint` (D4)                      | 11         |
| 15  | `build: publish the API image and add a compose stack` (E1)                    | 12         |
| 16  | `feat(auth): OIDC accounts with token-derived audit actors` (F)                | 12, 5      |

PRs 1–3 can go in parallel; 4–6 are one thread; 7–8 another; 9–10 a third; 11–14 a fourth.

---

## 13. Test strategy by layer

| Layer          | Where                                                                         | What it must prove                                                               |
| -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Unit           | colocated `*.test.ts`                                                         | Pure functions: mappers, escaping, citation formatting, figures, plan projection |
| HTTP           | `services/api/test/http*.test.ts`                                             | Status codes, error shapes, auth matrix, body limits, new routes                 |
| Contract       | `services/api/test/contract.test.ts` → `apps/dashboard/src/api/__fixtures__/` | Recorded responses keep matching the server; dashboard mappers read them         |
| Store contract | `services/api/test/store-contract.test.ts`                                    | Same semantics on filesystem and Postgres; two clients append safely             |
| Integration    | CI service containers (Postgres, Redis, MinIO)                                | Real database trigger, shared limiter, S3 round-trip                             |
| Toolchain      | fake binaries (`su2-http.test.ts` pattern) + one real-toolchain CI job        | Spawn/timeout/error paths without a solver or TeX on the developer's machine     |
| Documentation  | `services/api/test/docs.test.ts`                                              | Routes, env vars, stages, workspace layout and `.env.example` match reality      |
| Bundle         | `scripts/check-bundle-secrets.mjs`                                            | No secret ships to the browser                                                   |
| Deploy         | `scripts/smoke-deploy.sh`                                                     | A deployed instance still refuses to package a synthetic run                     |

Every workstream above adds tests in the first three rows; only D adds the fourth and fifth.

---

## 14. Dependency policy

Adding a dependency needs a sentence in the PR saying why 50 lines of our own are worse. The plan
needs exactly six:

| Package                                                  | Used by | Why not our own                                                                                                                                                                             |
| -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg` (added)                                             | D2      | protocol + pooling + types; not a thing to hand-roll                                                                                                                                        |
| `embedded-postgres` (dev only, added)                    | D2      | real Postgres binaries for the tests; CI runs the same suite without a Docker daemon                                                                                                        |
| `ioredis` (added)                                        | D3      | reconnect/backoff semantics and Lua evaluation; hand-rolling RESP is not worth it                                                                                                           |
| `@aws-sdk/client-s3`                                     | D4      | SigV4 signing and multipart are error-prone                                                                                                                                                 |
| `jose` (added)                                           | F       | JWT/JWKS verification is security-critical: signature checking, `kid` rotation, JWKS caching and the claim checks are exactly the code nobody should hand-roll. 1 dependency, 0 transitive. |
| `docker/build-push-action`, `docker/setup-buildx-action` | E       | CI only                                                                                                                                                                                     |
| `actions/*` already in use                               | E       | CI only                                                                                                                                                                                     |

Explicitly rejected: an ORM (SQL is ~200 lines here and the schema is three tables), a state
library (the source interface is smaller than the config), React Query (one `useResource` hook,
no cache semantics we need), a schema validator (hand-written `assertShape` helpers plus the
contract fixtures catch what matters), any model SDK (ADR-0001).

---

## 15. Risk register

| Risk                                                      | Likelihood   | Mitigation                                                                                                                                                              |
| --------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard/view-model mismatch produces invented UI values | Medium       | The field table in §5 is a decision list; mappers return `undefined` rather than a default; a test asserts every live cell is either from the payload or “not recorded” |
| TeX Live bloats the image or breaks CI                    | Medium       | Opt-in build arg; separate CI job with a path filter; `smoke:latex` degrades to source-only                                                                             |
| Postgres migration changes a hash                         | Low / severe | `db:import` preserves `seq`/`prev_hash`/`hash` and asserts `verify()` immediately; archive the NDJSON before importing                                                  |
| Dual-store support doubles maintenance                    | Medium       | Ports land first, contract suite is written before the second adapter, filesystem stays the default                                                                     |
| Accounts break scripts                                    | Medium       | `AEROSCRIBE_AUTH=token` retained; `/health` names the mode; smoke script passes a token                                                                                 |
| Staging host choice stalls the milestone                  | Medium       | Compose + SSH is the default and needs no vendor decision; the workflow is reusable for any Docker host                                                                 |
| Coverage thresholds ratchet past what UI wiring can meet  | Low          | Thresholds are floors, not targets; new code is tested with the same rigour; any proposed decrease is a review item (§3)                                                |
| Plan drifts from reality                                  | Medium       | This document is updated in the same PR as the code; `docs.test.ts` already enforces the other two docs                                                                 |

---

## 16. Non-goals (kept out on purpose)

- Multi-tenant SaaS: billing, organisations, SSO per tenant, quotas.
- Real-time collaboration or websockets; the dashboard refreshes, it does not stream.
- An LLM prose generator. RULE-001 is enforceable because the writer is deterministic (ADR-0001).
- Publisher submission APIs; the package ends at a downloadable, checksummed artefact.
- Kubernetes, Terraform, or a service mesh.
- Mobile apps, i18n, dark mode.

---

## 17. What the status documents will say when this lands

Only after the acceptance criteria hold.

| File / row                             | Today                                                    | After                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMPLEMENTATION_STATUS.md` → dashboard | Implemented, fixture data                                | Implemented; **live against the API** when `VITE_API_URL` is set, fixtures otherwise, labelled either way                                                                       |
| → LaTeX compilation                    | Implemented (B, § 6)                                     | `.tex` + inline bibliography + pgfplots figures always; PDF and a toolchain version when `LATEX_BINARY` answers, otherwise `typeset: "source-only"` and a named stage-8 blocker |
| → Persistence                          | Implemented: filesystem **or** Postgres (D1–D2)          | Implemented: filesystem **or** Postgres, shared Redis for limits/locks, content-addressed artefact bytes (D1–D4a); S3 is D4b                                                    |
| → Authentication                       | OIDC accounts + roles, token mode retained for scripts   | done in F, except the refresh endpoint (§10 "Status of F")                                                                                                                      |
| → CI / deployment                      | Typecheck, lint, coverage, builds, image build           | … plus image publish (GHCR, multi-arch, SBOM) and a staging deploy gated by a post-deploy smoke                                                                                 |
| → CFD solver adapter                   | Real SU2 + synthetic                                     | unchanged — this plan does not touch the solver                                                                                                                                 |
| `specs/integrity-rules.md`             | RULE-002/030/032/033/043/053/063 partial, not met or N/A | Each moves to **API** or **Process** with the file that enforces it; RULE-022 stays N/A with an ADR link                                                                        |

---

## 18. Decisions needed before M1, M4, M5

1. **Hosting for E.** Default is self-hosted compose over SSH (no vendor account). Alternative:
   Render/Fly. Which?
2. **Is multi-instance real?** If the answer is “one box for now”, D3 and D4 can be deferred
   indefinitely and only D1+D2 are needed for F — say so and the plan saves ~3.5 days.
3. **Accounts: OIDC against which provider?** GitHub OIDC (fits the repo) or a generic issuer?
   The code is provider-agnostic, the smoke test is not.
4. **Pages dashboard.** Keep the published dashboard on fixtures (recommended: it cannot hold a
   token, and a public API does not exist yet), or point the Pages build at a public API once E
   lands?
