# Architecture (as built)

This document describes the repository as it exists today, not the larger system in
[`archive/design-spec-v0.1.md`](archive/design-spec-v0.1.md). If the two disagree, this file wins.

## Repository layout

```
aeroscribe/
├── apps/
│   ├── landing-page/          Vite + React 19 static marketing site
│   └── dashboard/             Vite + React 19 prototype researcher dashboard
├── packages/
│   ├── contract/              Wire types shared by services/api and the dashboard
│   ├── pipeline/              Domain types, stage catalogue, reducer, stats, formatting
│   └── ui/                    The cn() class-name helper (currently the only shared UI utility)
├── services/
│   └── api/                   Hono HTTP service: agents, literature, CFD, evidence registry
├── specs/                     Short, maintained specifications
├── docs/                      BACKEND.md, IMPLEMENTATION_STATUS.md, reports
├── .github/workflows/         CI (all branches/PRs) and Pages deployment (main)
├── Dockerfile                 The API image (web apps deploy as static files)
├── package.json               npm workspaces root; one lockfile
└── tsconfig.base.json         Strict TypeScript shared by every workspace
```

`apps/*`, `packages/*` and `services/*` are npm workspaces. There is one root
`package-lock.json`; the per-app lockfiles that existed before the monorepo conversion were
deleted.

## Runtime data flow

```
browser ──► apps/landing-page, apps/dashboard     (static, GitHub Pages)
   │
   └── no requests: the dashboard still renders fixtures

HTTP client ──► services/api  (Hono, Node 22)
                    │
                    ├── POST /api/v1/runs            Orchestrator, 9 stages, gates
                    │        ├─ stage 1  literature → Crossref / arXiv / S2
                    │        ├─ stage 4  CFD        → SU2 binary, or labelled synthetic
                    │        └─ stage 5+ writing, review, compliance, package
                    ├── GET  /api/v1/evidence…       hash-chained NDJSON registry
                    └── AEROSCRIBE_DATA_DIR/         runs/*.json, registry, audit
```

Two separate flows, and they do not meet yet: **the dashboard is a static prototype fed by
fixtures**, and **the API is a real service driven by HTTP clients** (the smoke scripts,
`curl`, or the tests). Wiring the dashboard to the API is tracked in
[`../docs/IMPLEMENTATION_STATUS.md`](../docs/IMPLEMENTATION_STATUS.md).

What each stage computes, and what it only records, is documented in
[`../docs/BACKEND.md`](../docs/BACKEND.md); the service never renders a number it did not
compute or retrieve in that run.

### Dashboard state

```
apps/dashboard/src/data/mockData.ts   (fixed ISO timestamps, `raw*` arrays)
        │
        │  rebaseFixture() — shifts timestamps relative to now at import time
        ▼
PipelineProvider (useReducer)  ──►  PipelineView / Dashboard / ReviewView / …
        │
        └── PipelineState { runs, activeRunId }
```

- **Fixtures, not results.** Every number shown in the dashboard comes from `mockData.ts`.
  The file says so at the top, and views that display results carry an "illustrative data"
  banner. See [`../docs/IMPLEMENTATION_STATUS.md`](../docs/IMPLEMENTATION_STATUS.md).
- **Timestamps.** Fixtures are authored with fixed ISO strings so diffs stay reviewable, then
  shifted at import time so relative labels ("2 days ago") stay plausible. `FIXTURE_NEWEST`
  is the anchor.
- **State.** All mutations go through the pure reducer in `packages/pipeline/src/reducer.ts`.
  Actions: `createRun`, `selectRun`, `approveGate`, `requestRevision`. The reducer never mutates
  its input; `apps/dashboard/src/components/PipelineView.test.tsx` asserts that approving a gate
  leaves the imported fixtures byte-for-byte unchanged.
- **No network from the browser.** Neither app calls the API, an LLM or an analytics service;
  the dashboard's gate buttons drive the in-memory reducer. The landing page's contact form
  posts to `VITE_CONTACT_ENDPOINT` only when that variable is configured; otherwise it opens
  a prefilled GitHub issue and says so explicitly.

## Shared domain package

`@aeroscribe/pipeline` is the single source of truth for:

| Module       | Responsibility                                                                               |
| ------------ | -------------------------------------------------------------------------------------------- |
| `types.ts`   | `PipelineRun`, `StageInfo`, `Paper`, `JournalProfile`, `WikiArticle`, `ManuscriptSection`, … |
| `stages.ts`  | The nine-stage catalogue and `createRun()`                                                   |
| `reducer.ts` | Run state machine (`approveGate`, `requestRevision`, `selectRun`)                            |
| `stats.ts`   | Derived counters (progress, review statistics, severity breakdown)                           |
| `format.ts`  | `formatMeasuredValue` (value ± uncertainty, significant-digit aware), `formatRelativeTime`   |

Both apps import the package through its `index.ts` barrel, and so does `services/api`: the
stage catalogue, gate ids and the run state machine are shared, so a gate the API opens is the
same gate the dashboard renders. The stage list used to be copied in three places (fixtures,
`PipelineView`, `Dashboard`); it now lives only in `stages.ts`.

## Rendering and assets

- React 19, Vite 7, Tailwind CSS 4 (`@tailwindcss/vite`), no runtime CSS-in-JS.
- Images and fonts are imported as ES modules from `src/assets` and `@fontsource/*`, so Vite
  fingerprints them and rewrites URLs against the configured `base`. This is what fixes the
  previously broken `/images/…` paths on GitHub Pages.
- The landing page ships a fully server-visible `<h1>`; the old typewriter effect (which left
  crawlers and screen readers with `World's Fir`) is gone.
- The dashboard is a sub-app: production `base` is `/Aeroscribe/dashboard/` (override with
  `BASE_PATH`) and it is marked `noindex`.

## Build and deployment

1. `npm ci` at the repository root.
2. `npm run build` → `apps/landing-page/dist` and `apps/dashboard/dist`.
3. The deploy workflow assembles `site/` (landing at the root, dashboard under `dashboard/`) and
   adds `.nojekyll`, then publishes with `actions/configure-pages` + `actions/deploy-pages`.

CI (`.github/workflows/ci.yml`) runs on every branch and pull request: typecheck, lint, format
check, `npm run coverage` (thresholds in `vitest.config.ts`), a production build of both apps,
and a separate job that typechecks the API, runs its 14 test suites and executes both smoke
scripts against the synthetic solver and the offline corpus.

`services/api` is a long-running Node process rather than a static artefact: `npm run start:api`
locally, or the `Dockerfile` (which installs with `--omit=dev`, because `tsx` — the service's
runtime — is a production dependency). Neither is deployed by this repository's workflows; the
Pages workflow only publishes the two static apps.

## What is deliberately absent

- **A database, queue or object store.** State is JSON and NDJSON under `AEROSCRIBE_DATA_DIR`.
  That is sufficient for one process and honest about its limits; see `docs/BACKEND.md` § 9.
- **A LaTeX toolchain.** Stage 8 assembles a submission bundle (Markdown/JSON plus artefact
  hashes), not a typeset PDF.
- **User accounts.** One shared bearer token (`AEROSCRIBE_API_KEY`), or none at all on a laptop.
- **A wired dashboard.** See the two-flow diagram above.
- **A real solver by default.** Without `SU2_CFD_BINARY`, stage 4 runs a labelled synthetic
  benchmark, and the run cannot pass the stage-8 gate.
