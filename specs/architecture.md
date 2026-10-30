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
│   ├── pipeline/              Domain types, stage catalogue, reducer, stats, formatting
│   └── ui/                    The cn() class-name helper (currently the only shared UI utility)
├── specs/                     Short, maintained specifications
├── docs/IMPLEMENTATION_STATUS.md
├── .github/workflows/         CI (all branches/PRs) and Pages deployment (main)
├── package.json               npm workspaces root; one lockfile
└── tsconfig.base.json         Strict TypeScript shared by every workspace
```

`apps/*` and `packages/*` are npm workspaces. There is one root `package-lock.json`; the
per-app lockfiles that existed before the monorepo conversion were deleted.

## Runtime data flow

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
- **No network.** Neither app calls a backend, an LLM or an analytics service. The landing
  page's contact form posts to `VITE_CONTACT_ENDPOINT` only when that variable is configured;
  otherwise it opens a prefilled GitHub issue and says so explicitly.

## Shared domain package

`@aeroscribe/pipeline` is the single source of truth for:

| Module       | Responsibility                                                                               |
| ------------ | -------------------------------------------------------------------------------------------- |
| `types.ts`   | `PipelineRun`, `StageInfo`, `Paper`, `JournalProfile`, `WikiArticle`, `ManuscriptSection`, … |
| `stages.ts`  | The nine-stage catalogue and `createRun()`                                                   |
| `reducer.ts` | Run state machine (`approveGate`, `requestRevision`, `selectRun`)                            |
| `stats.ts`   | Derived counters (progress, review statistics, severity breakdown)                           |
| `format.ts`  | `formatMeasuredValue` (value ± uncertainty, significant-digit aware), `formatRelativeTime`   |

Both apps import the package through its `index.ts` barrel. The stage list used to be copied in
three places (fixtures, `PipelineView`, `Dashboard`); it now lives only in `stages.ts`.

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
check, `vitest run`, and a production build of both apps.

## Deliberate omissions

No server, database, authentication, queue, LLM client or CFD solver is present. The agent
backend described in the design draft has not been built; the dashboard is its clickable
prototype.
