# AeroScribe

An open prototype of an auditable autonomous aerospace research pipeline: nine gated
stages from literature archaeology to a submission-ready manuscript, where every quantitative
claim is meant to trace back to a recorded computation.

**Status: early prototype.** The two web apps and the pipeline state machine exist and are
tested. The agent backend, literature APIs, CFD solvers and checksummed registry do **not**
exist; everything you see in the dashboard is labelled fixture data. Read
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) before trusting any number.

[Landing page](https://knarayanareddy.github.io/Aeroscribe/) ·
[Researcher dashboard](https://knarayanareddy.github.io/Aeroscribe/dashboard/) ·
[Implementation status](docs/IMPLEMENTATION_STATUS.md) ·
[Architecture](specs/architecture.md) ·
[Pipeline and gates](specs/pipeline.md) ·
[Integrity rules](specs/integrity-rules.md)

## What is here

| Path                            | What it is                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/landing-page`             | Static marketing/info site (Vite, React 19, Tailwind 4). No third-party requests; fonts are self-hosted.           |
| `apps/dashboard`                | Researcher dashboard prototype: nine views over fixtures, plus a real (in-memory) pipeline state machine.          |
| `packages/pipeline`             | Domain types, the nine-stage catalogue, the pure reducer, derived statistics and number formatting.                |
| `packages/ui`                   | `cn()` class-name helper.                                                                                          |
| `specs/`                        | Short, maintained specifications. `specs/archive/` keeps the original design drafts, clearly marked as historical. |
| `docs/IMPLEMENTATION_STATUS.md` | What works, what is a mock, what is missing.                                                                       |

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
```

The dashboard is a prototype: create a run, approve a gate, send a stage back for revision — the
state machine is real, the surrounding data is fixture data.

## Scripts

| Command                                         | What it does                                          |
| ----------------------------------------------- | ----------------------------------------------------- |
| `npm run dev:landing` / `npm run dev:dashboard` | Start one app with hot reload.                        |
| `npm run build`                                 | Typecheck and build both apps into `apps/*/dist`.     |
| `npm run typecheck`                             | `tsc --noEmit` in every workspace.                    |
| `npm test`                                      | Vitest suite across both apps and the shared package. |
| `npm run test:watch`                            | Vitest in watch mode.                                 |
| `npm run lint` / `npm run lint:fix`             | ESLint (flat config) for both apps and packages.      |
| `npm run format` / `npm run format:check`       | Prettier.                                             |

## Configuration

| Variable                | Used by      | Purpose                                                                                                                                                                                |
| ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASE_PATH`             | both builds  | Production asset base path. Defaults to `/Aeroscribe/` (landing) and `/Aeroscribe/dashboard/` (dashboard). Set when deploying under a different path or domain.                        |
| `VITE_DASHBOARD_URL`    | landing page | Where "Open the dashboard" points. Defaults to `/Aeroscribe/dashboard/`; set it if you deploy under a different base.                                                                  |
| `VITE_CONTACT_ENDPOINT` | landing page | If set, the contact form `POST`s JSON to this URL. If unset, the form opens a prefilled GitHub issue and tells the visitor so — it never claims to have sent anything it did not send. |

No secret is ever read by the browser. The dashboard settings view is read-only and shows
configuration as "Not configured".

## Deployment

`.github/workflows/deploy.yml` publishes to GitHub Pages on pushes to `main`: the landing page at
the site root and the dashboard under `/dashboard/`. It verifies typecheck and tests before
publishing. Pull requests run the separate CI workflow (`.github/workflows/ci.yml`) which adds
lint, format checking and a production build of both apps.

## Documentation

- [`specs/architecture.md`](specs/architecture.md) — the system as built
- [`specs/pipeline.md`](specs/pipeline.md) — nine stages, eleven specified gate checkpoints, reducer semantics
- [`specs/integrity-rules.md`](specs/integrity-rules.md) — the non-negotiable rules and how much of each is enforced today
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) — the honest inventory

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The most useful contributions right now are tests for
the pipeline state machine, a CFD evidence adapter behind a defined interface, or a LaTeX/PDF
build pipeline.

## License

MIT — see [`LICENSE`](LICENSE). The interface is a prototype; nothing here is a validated
research tool, and no output of this repository should be submitted to a journal.
