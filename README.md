# AeroScribe

An open prototype of an auditable autonomous aerospace research pipeline: nine gated
stages from literature archaeology to a submission-ready manuscript, where every quantitative
claim is meant to trace back to a recorded computation.

**Status: prototype with a working backend.** The two web apps, the pipeline state machine and
a real API in `services/api` are implemented and tested: nine stage handlers, Crossref/arXiv/
Semantic Scholar clients, a SU2 adapter with grid-convergence verification, and an append-only
hash-chained evidence registry that the writing stage is checked against. Two honest caveats:
the dashboard still renders fixture data (it is not wired to the API yet), and without a real
SU2 binary the CFD stage runs a **labelled synthetic benchmark** that blocks submission. Read
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) before trusting any number.

[Landing page](https://knarayanareddy.github.io/Aeroscribe/) ·
[Researcher dashboard](https://knarayanareddy.github.io/Aeroscribe/dashboard/) ·
[Implementation status](docs/IMPLEMENTATION_STATUS.md) ·
[Backend map](docs/BACKEND.md) ·
[Architecture](specs/architecture.md) ·
[Pipeline and gates](specs/pipeline.md) ·
[Integrity rules](specs/integrity-rules.md)

## What is here

| Path                            | What it is                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/landing-page`             | Static marketing/info site (Vite, React 19, Tailwind 4). No third-party requests; fonts are self-hosted.           |
| `apps/dashboard`                | Researcher dashboard prototype: nine views over fixtures, plus a real (in-memory) pipeline state machine.          |
| `services/api`                  | The agent runtime: orchestrator, stage handlers, evidence registry, literature and CFD adapters, HTTP API.         |
| `packages/pipeline`             | Domain types, the nine-stage catalogue, the pure reducer, derived statistics and number formatting.                |
| `packages/ui`                   | `cn()` class-name helper.                                                                                          |
| `specs/`                        | Short, maintained specifications. `specs/archive/` keeps the original design drafts, clearly marked as historical. |
| `docs/IMPLEMENTATION_STATUS.md` | What works, what is a mock, what is missing.                                                                       |
| `docs/BACKEND.md`               | Step-by-step map of the backend: stages, evidence, endpoints, configuration, failure modes.                        |

## Requirements

- Node.js **>= 20.19** (`.nvmrc` pins 22; CI uses the same file)
- npm 10+

## Quick start

```bash
git clone https://github.com/knarayanareddy/Aeroscribe.git
cd Aeroscribe
npm ci

npm run dev:landing     # http://localhost:5173
npm run dev:dashboard   # http://localhost:5174
npm run dev:api         # http://localhost:8787
```

The dashboard is a prototype: create a run, approve a gate, send a stage back for revision — the
state machine is real, the surrounding data is fixture data.

The API runs a whole pipeline for real. This walks one stage and stops at its gate:

```bash
curl -s localhost:8787/api/v1/runs -H 'content-type: application/json' \
  -d '{"topic":"transonic wing drag prediction","options":{"solver":"synthetic"}}'
curl -s -X POST localhost:8787/api/v1/runs/run-1/advance -d '{"actor":"ana"}'
curl -s localhost:8787/api/v1/runs/run-1/evidence
curl -s localhost:8787/api/v1/evidence/verify      # {"valid":true,...}
```

No API key is required until you set `AEROSCRIBE_API_KEY` — and `/health` reports which mode you
are in. Offline mode (`AEROSCRIBE_OFFLINE=1`) keeps every test and demo away from the network;
its fixture papers carry no DOIs, so an offline run can never cite anything.

## Scripts

| Command                                         | What it does                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev:landing` / `npm run dev:dashboard` | Start one app with hot reload.                                            |
| `npm run build`                                 | Typecheck and build both apps into `apps/*/dist`.                         |
| `npm run typecheck`                             | `tsc --noEmit` in every workspace.                                        |
| `npm test`                                      | Vitest suite across both apps and the shared package.                     |
| `npm run test:watch`                            | Vitest in watch mode.                                                     |
| `npm run lint` / `npm run lint:fix`             | ESLint (flat config) for both apps and packages.                          |
| `npm run format` / `npm run format:check`       | Prettier.                                                                 |
| `npm run dev:api` / `npm run start:api`         | Run the API with `tsx` (watch / once).                                    |
| `npm run smoke:literature -- "your topic"`      | Live search across all three providers, then resolve every DOI it got.    |
| `npm run smoke:cfd`                             | Grid-convergence study, printing the mesh table and the asymptotic check. |

## Configuration

| Variable                | Used by      | Purpose                                                                                                                                                                                |
| ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASE_PATH`             | both builds  | Production asset base path. Defaults to `/Aeroscribe/` (landing) and `/Aeroscribe/dashboard/` (dashboard). Set when deploying under a different path or domain.                        |
| `VITE_DASHBOARD_URL`    | landing page | Where "Open the dashboard" points. Defaults to `/Aeroscribe/dashboard/`; set it if you deploy under a different base.                                                                  |
| `VITE_CONTACT_ENDPOINT` | landing page | If set, the contact form `POST`s JSON to this URL. If unset, the form opens a prefilled GitHub issue and tells the visitor so — it never claims to have sent anything it did not send. |

No secret is ever read by the browser. The dashboard settings view is read-only and shows
configuration as "Not configured".

The API has its own environment: `AEROSCRIBE_API_KEY`, `AEROSCRIBE_CONTACT_EMAIL`,
`AEROSCRIBE_OFFLINE`, `AEROSCRIBE_DATA_DIR`, `SU2_CFD_BINARY`, `AEROSCRIBE_CORS_ORIGINS`,
`AEROSCRIBE_UPSTREAM_TIMEOUT_MS`, `AEROSCRIBE_RETRY_BASE_MS` and the server-only
`SEMANTIC_SCHOLAR_API_KEY`. They are documented one by one in
[`docs/BACKEND.md`](docs/BACKEND.md).

## Deployment

`.github/workflows/deploy.yml` publishes to GitHub Pages on pushes to `main`: the landing page at
the site root and the dashboard under `/dashboard/`. It verifies typecheck and tests before
publishing. Pull requests run the separate CI workflow (`.github/workflows/ci.yml`), which adds
lint, format checking, a production build of both apps, and a separate job that typechecks, tests
and runs the synthetic CFD smoke test for `services/api`.

## Documentation

- [`docs/BACKEND.md`](docs/BACKEND.md) — the backend, stage by stage, with endpoints and failure modes
- [`specs/architecture.md`](specs/architecture.md) — the system as built
- [`specs/pipeline.md`](specs/pipeline.md) — nine stages, eleven specified gate checkpoints, reducer semantics
- [`specs/integrity-rules.md`](specs/integrity-rules.md) — the non-negotiable rules and how much of each is enforced today
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) — the honest inventory

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The most useful contributions right now are wiring the
dashboard to the API, a LaTeX/PDF build stage, or an OpenFOAM adapter behind the same
`CfdService` interface.

## License

MIT — see [`LICENSE`](LICENSE). The interface is a prototype; nothing here is a validated
research tool, and no output of this repository should be submitted to a journal.
