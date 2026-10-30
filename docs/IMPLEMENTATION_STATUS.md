# Implementation status

Last reviewed: 2026-10-30. This file is the honest answer to "what actually works?".
If a marketing page, a screenshot or an archived design document disagrees with this table,
this table is correct. The backend is mapped step by step in [`BACKEND.md`](./BACKEND.md).

## Summary

| Area                      | Status                   | Notes                                                                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Landing page              | **Implemented**          | Static site, keyboard accessible, self-hosted fonts, no third-party requests.                                 |
| Researcher dashboard (UI) | **Implemented**          | Nine views over fixture data, responsive down to 360 px.                                                      |
| Pipeline state machine    | **Implemented**          | Pure reducer in `packages/pipeline`; gate approval, revision requests, run creation.                          |
| Automated tests           | **Implemented**          | Vitest + Testing Library: 214 tests across 25 files, apps and API.                                            |
| CI / deployment           | **Implemented**          | Typecheck, lint, format check, tests and builds for both apps and the API on every PR.                        |
| Agent runtime (backend)   | **Implemented**          | `services/api`: 9 stage handlers, orchestrator, gates, revisions, audit trail.                                |
| Literature APIs           | **Implemented**          | Crossref, arXiv and Semantic Scholar clients with DTO mapping, retries and politeness.                        |
| CFD solver adapter        | **Implemented**          | Real SU2 adapter (three-mesh study) plus a labelled synthetic benchmark for machines without it.              |
| Grid-convergence (GCI)    | **Implemented**          | Roache GCI with order estimate, Richardson extrapolation and asymptotic-range rejection.                      |
| Verified registry         | **Implemented**          | Append-only NDJSON hash chain; tamper, reorder and deletion are detected.                                     |
| Claim verification        | **Implemented**          | Stage 5 refuses to write a manuscript containing an unbacked number or unresolved DOI.                        |
| HTTP API                  | **Implemented**          | Hono server: runs, gates, evidence, audit, literature, claim checks, rate limiting.                           |
| Persistence               | **Implemented (server)** | Runs, options, evidence and audit persist on disk and survive restarts. The dashboard still renders fixtures. |
| LaTeX compilation         | **Not implemented**      | The manuscript view generates a `.tex` document client-side; no PDF build.                                    |
| Journal submission        | **Not implemented**      | Stage 8 builds an evidence manifest only; nothing is uploaded.                                                |
| Authentication            | **Partial**              | Single server-side bearer token; no accounts, no per-user data, off when no key is set.                       |
| LLM-generated prose       | **Not implemented**      | Deliberately: the writer is mechanical so RULE-001 can be enforced exactly.                                   |
| Wiki persistence          | **Not implemented**      | Wiki edits and drafts are local to the session and labelled as such.                                          |

## What each dashboard view actually does

| View       | Behaviour                                                                                                                                                           | Honest label in the UI               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Overview   | Counts and progress derived from the fixture runs.                                                                                                                  | "illustrative data"                  |
| Pipeline   | Create a run, expand stages, approve gates, send a stage back for revision. State is real (in memory) and immutable.                                                | "illustrative data"                  |
| Literature | Search, tag filter and minimum-relevance filter over fixture papers.                                                                                                | fixture disclaimer banner            |
| Novelty    | Gaps sorted by novelty score, contradiction pairs with conflict percentage.                                                                                         | fixture disclaimer banner            |
| CFD        | Results, convergence history and checksum registry from fixtures; degenerate series render an explicit "no convergence series" message instead of a divide-by-zero. | "illustrative fixtures"              |
| Manuscript | Section list, word targets, AIAA compliance checklist, and real client-side `.tex` generation/copy/download.                                                        | checklist items flagged when missing |
| Review     | Severity filters, resolution statistics that show `0%` (never `NaN`), respond-and-resolve flow.                                                                     | "illustrative comments"              |
| Wiki       | Markdown rendered as React elements (no `dangerouslySetInnerHTML`), search, category grouping, local editing.                                                       | "local session only" warning         |
| Settings   | Read-only view of environment, journal profiles, agents and integrity rules. No credential inputs.                                                                  | values shown as "Not configured"     |

## Data honesty

Every quantitative value in `apps/dashboard/src/data/mockData.ts` is fabricated demo data. The
file states this in its header. Timestamps are authored as fixed ISO strings and rebased
relative to "now" at import time. No value is the output of a computation, an experiment or a
model run, and nothing in the UI is allowed to imply otherwise.

What was removed or corrected in this pass:

- Fabricated publications with DOI-shaped identifiers (`10.1234/...`) that linked to doi.org.
- A team section listing six people with real-employer affiliations who are not on the project.
- Advertised accuracy figures (`99.7%`, `99.3%`) with no measurement behind them.
- Engagement counters (`247 papers`, `1,382 citations`, `89 gaps`) presented as real totals.
- A contact form that displayed "Message sent" while discarding the message, and a newsletter
  form that did nothing.
- API-key inputs and an "Update configuration" button that persisted nothing.

## Backend reality check

The API in `services/api` is real code with real integrations, but three things are worth
stating plainly:

- **The dashboard is not wired to it yet.** Every view still renders fixtures; the API is
  exercised through `curl`, the smoke scripts and the test suite.
- **Synthetic CFD is not physics.** Without `SU2_CFD_BINARY` the pipeline runs a
  deterministic analytic benchmark so the verification path can be tested. It is labelled
  in every artefact, the manuscript is marked `synthetic: true`, the review verdict is
  `revise`, and stage 8 blocks submission.
- **Offline literature can never be cited.** The fixture corpus has no DOIs by design, so
  RULE-002 makes offline references impossible — as it should be.

## Known limitations

- Dashboard fixture data is static; the UI does not call the API.
- Gate approvals made in the dashboard are lost on reload (the server persists its own).
- Wiki edits are not persisted anywhere.
- The API rate limiter is per process, and the registry assumes a single writer.
- No LaTeX/PDF build and no journal upload path.
- The dashboard is marked `noindex` and is a prototype, not a product.
