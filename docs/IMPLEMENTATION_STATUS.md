# Implementation status

Last reviewed: 2026-10-30. This file is the honest answer to "what actually works?".
If a marketing page, a screenshot or an archived design document disagrees with this table,
this table is correct.

## Summary

| Area                      | Status              | Notes                                                                                     |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| Landing page              | **Implemented**     | Static site, keyboard accessible, self-hosted fonts, no third-party requests.             |
| Researcher dashboard (UI) | **Implemented**     | Nine views over fixture data, responsive down to 360 px.                                  |
| Pipeline state machine    | **Implemented**     | Pure reducer in `packages/pipeline`; gate approval, revision requests, run creation.      |
| Automated tests           | **Implemented**     | Vitest + Testing Library; 75 tests across 14 files.                                       |
| CI / deployment           | **Implemented**     | Typecheck, lint, format check, tests and builds on every PR; both apps deployed to Pages. |
| Agent backend             | **Not implemented** | No orchestrator, no LLM calls, no job queue.                                              |
| Literature APIs           | **Not implemented** | Semantic Scholar / arXiv / Crossref / NTRS clients do not exist.                          |
| CFD solvers               | **Not implemented** | No SU2/OpenFOAM/Eilmer4 integration; the CFD view renders fixture metrics.                |
| Verified registry         | **Not implemented** | No checksummed, append-only store. Checksums in the UI are fixture strings.               |
| LaTeX compilation         | **Not implemented** | The manuscript view generates a `.tex` document client-side; no PDF build.                |
| Authentication            | **Not implemented** | No login, no user accounts, no per-user data.                                             |
| Persistence               | **Not implemented** | Dashboard state lives in memory; a reload restores the fixtures.                          |
| Wiki persistence          | **Not implemented** | Wiki edits and drafts are local to the session and labelled as such.                      |

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

## Known limitations

- Fixture data is static; nothing is fetched, computed or verified at runtime.
- Gate approvals and revisions are lost on reload.
- Wiki edits are not persisted anywhere.
- The dashboard is marked `noindex` and is a prototype, not a product.
- There is no backend to enforce the rules in [`specs/integrity-rules.md`](../specs/integrity-rules.md);
  where a rule is only enforced by convention, the rules document says so.
