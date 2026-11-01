# Implementation status

Last reviewed: 2026-10-31. This file is the honest answer to "what actually works?".
If a marketing page, a screenshot or an archived design document disagrees with this table,
this table is correct. The backend is mapped step by step in [`BACKEND.md`](./BACKEND.md), and
everything still missing is planned in [`ROADMAP.md`](./ROADMAP.md).

## Summary

| Area                      | Status                   | Notes                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page              | **Implemented**          | Static site, keyboard accessible, self-hosted fonts, no third-party requests.                                                                                                                                                                                                             |
| Researcher dashboard (UI) | **Implemented**          | Nine views, responsive down to 360 px. Fixture mode is the default build; live mode (Overview, Pipeline, Literature, CFD, Settings) is opt-in.                                                                                                                                            |
| Pipeline state machine    | **Implemented**          | Pure reducer in `packages/pipeline`; gate approval, revision requests, run creation.                                                                                                                                                                                                      |
| Automated tests           | **Implemented**          | Vitest + Testing Library: 495 tests across 45 files, apps and API; CI enforces coverage thresholds (78 / 67 / 72 / 80 % global, 91 / 79 / 89 / 93 % for the service).                                                                                                                     |
| CI / deployment           | **Implemented**          | Typecheck, lint, format check, coverage thresholds, both app builds and the API image (built and health-checked) on every PR.                                                                                                                                                             |
| Agent runtime (backend)   | **Implemented**          | `services/api`: 9 stage handlers, orchestrator, gates, revisions, audit trail.                                                                                                                                                                                                            |
| Literature APIs           | **Implemented**          | Crossref, arXiv and Semantic Scholar clients with DTO mapping, retries and politeness. Offline fixtures carry no DOIs.                                                                                                                                                                    |
| CFD solver adapter        | **Implemented**          | Real SU2 adapter (three-mesh study) plus a labelled synthetic benchmark for machines without it.                                                                                                                                                                                          |
| Grid-convergence (GCI)    | **Implemented**          | Roache GCI with order estimate, Richardson extrapolation and asymptotic-range rejection.                                                                                                                                                                                                  |
| Verified registry         | **Implemented**          | Append-only NDJSON hash chain; tamper, reorder and deletion are detected.                                                                                                                                                                                                                 |
| Claim verification        | **Implemented**          | Stage 5 refuses to write a manuscript containing an unbacked number or unresolved DOI.                                                                                                                                                                                                    |
| Reference re-checks       | **Implemented**          | `references/recheck.ts` re-resolves stored DOIs on demand, appends one `doi-recheck` record, and stage 8 blocks on `broken`/`mismatch`.                                                                                                                                                   |
| HTTP API                  | **Implemented**          | Hono server: runs, gates, evidence, audit, literature, claim checks, rate limiting. `docker build` + `docker run` documented in `BACKEND.md` § 9.                                                                                                                                         |
| Persistence               | **Implemented (server)** | Runs, options, evidence and audit persist on disk **or** in Postgres (`AEROSCRIBE_STORE`), and survive restarts. Postgres serialises appends with an advisory lock and refuses to rewrite history at the database; `npm run db:migrate` / `db:verify` / `db:import` manage it.            |
| LaTeX compilation         | **Implemented**          | `services/api/src/latex` renders `manuscript.tex`, `references.bib` and pgfplots figures for every run that reaches stage 8; `manuscript.pdf` is compiled when `LATEX_BINARY` answers `--version`, otherwise the record says `typeset: "source-only"` and stage 8 blocks with the reason. |
| Journal submission        | **Not implemented**      | Stage 8 builds an evidence manifest only; nothing is uploaded.                                                                                                                                                                                                                            |
| Authentication            | **Partial**              | Single server-side bearer token; no accounts, no per-user data, off when no key is set.                                                                                                                                                                                                   |
| LLM-generated prose       | **Not implemented**      | Deliberately: the writer is mechanical so RULE-001 can be enforced exactly.                                                                                                                                                                                                               |
| Wiki persistence          | **Not implemented**      | Wiki edits and drafts are local to the session and labelled as such.                                                                                                                                                                                                                      |

## What each dashboard view actually does

The first table describes **fixture mode**, which is what `npm run build` produces unless
`VITE_API_URL` is set. The second table describes **live mode**, which is opt-in and is not what
the deployed Pages build runs.

### Live mode (`VITE_API_URL` set)

| View       | Behaviour                                                                                                                                        | Where the data comes from                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Overview   | Run counts and progress from the API; "verified references" and "evidence records" are counted from the selected run's records.                  | `GET /api/v1/runs`, `GET /api/v1/runs/:id/evidence` |
| Pipeline   | Create a run, run the next stage, approve or reject a gate. Every mutation re-reads the run from the server.                                     | `POST /runs`, `POST /runs/:id/advance`, gate routes |
| Literature | The run's admitted references, with DOI, venue, and the timestamp of the resolution that admitted each one. No relevance score.                  | `literature-search` evidence record                 |
| CFD        | The measured value, its GCI uncertainty, the mesh table and artefact hashes. A synthetic result says so at the top.                              | `cfd-run` evidence record                           |
| Settings   | The server's own capabilities: literature mode, SU2 and LaTeX availability, registry path, auth. Plus the audit trail.                           | `GET /api/v1/capabilities`, `GET /api/v1/audit`     |
| Novelty    | Term coverage: which topic terms no verified abstract mentions, with the stage's own confidence label. No novelty score — none is computed.      | `novelty-report` evidence record                    |
| Manuscript | Title, abstract, sections, word counts, references and the newest DOI re-check, flagged when a number is synthetic, with no `.tex` download yet. | `manuscript`, `doi-recheck` evidence records        |
| Review     | The council's verdict, its named checks and its comments. Read-only: a finding is answered by changing evidence, not by clicking resolve.        | `review-report` evidence record                     |
| Wiki       | The article stage 8 generated, rendered from markdown as React elements (never as HTML), read-only because it is part of the evidence record.    | `submission-package` evidence record (`wiki`)       |

An unreachable API shows `API unreachable · <reason>` and zero fixture rows. It never falls back.

### Fixture mode (default)

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

- **The default dashboard build is fixture-only.** `npm run build` produces a bundle with no API
  address in it, and every screen says "Fixtures · illustrative data". Live mode exists — set
  `VITE_API_URL` — but only five views consume it; the other four refuse to render in live mode
  rather than show fixture data under a live badge. The deployed Pages build is fixture-only.
- **Synthetic CFD is not physics.** Without `SU2_CFD_BINARY` the pipeline runs a
  deterministic analytic benchmark so the verification path can be tested. It is labelled
  in every artefact, the manuscript is marked `synthetic: true`, the review verdict is
  `revise`, and stage 8 blocks submission.
- **Offline literature can never be cited.** The fixture corpus has no DOIs by design, so
  RULE-002 makes offline references impossible — as it should be.

## Known limitations

- The default dashboard build is static fixture data. Live mode needs a running API.
- In live mode the manuscript view lists the rendered files with their sizes and SHA-256 hashes,
  and links to `manuscript.tex` (and `manuscript.pdf` when one was typeset). In fixture mode the
  links are absent, because the dashboard cannot serve a file the API owns.
- In live mode a gate approval is a real server call and survives a reload. In fixture mode it is
  still local to the session, and the run list resets.
- Wiki edits are not persisted anywhere.
- The filesystem store is single-writer; Postgres is not. `/health` names the backend, so a
  second replica is a visible decision rather than a silent corruption.
- The API rate limiter and the in-flight stage guard are per process unless
  `AEROSCRIBE_COORDINATION=redis` is configured. With Redis both are shared — one budget across
  instances, and `advance` on a run another instance holds answers `409` — and `/health` names
  which backend is in force.
- CFD working directories and rendered manuscripts are local files in both modes; their
  durable record is the SHA-256 in the evidence chain. Object storage (D4) is not built.
- **A PDF is not guaranteed.** Without `LATEX_BINARY` — unset on the deployed machine, and in
  the default container image — the run records `typeset: "source-only"`, `/manuscript.pdf`
  answers `503 capability_unavailable`, and stage 8 refuses to submit with
  `the manuscript PDF was not typeset (LATEX_BINARY is not set)`. The `.tex` is always written.
- No journal upload path: stage 8 assembles a submission bundle (manuscript files, the PDF when
  one exists, and artefact hashes). Nothing is sent to a journal.
- **DOI re-verification is on demand, never automatic.** A paper is resolved when it is
  retrieved, and a stored manuscript is only re-checked when someone runs
  `npm run recheck -- --all` or calls `POST /api/v1/runs/:id/references/recheck`. There is no
  timer inside the API; until a re-check runs, stage 8 reports the generation-time timestamps
  and labels the run `generation-time only`.
- **No staging environment.** CI builds and tests; only the two static apps are deployed.
  The Dockerfile is built in CI but published nowhere.
- One shared bearer token, no user accounts, no per-user data isolation.
- The dashboard is marked `noindex` and is a prototype, not a product.
