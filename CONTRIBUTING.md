# Contributing

Thanks for taking a look. This is an early-stage prototype; small, well-tested changes are more
useful than large rewrites.

## Setup

```bash
git clone https://github.com/knarayanareddy/Aeroscribe.git
cd Aeroscribe
npm ci
npm run dev:landing     # or npm run dev:dashboard / npm run dev:api
```

Node >= 20.19 is required (`.nvmrc` pins 22). The API needs `tsx` (installed with the
workspace) and no external services: `AEROSCRIBE_OFFLINE=1` keeps the literature stage on the
bundled fixture corpus, and the CFD stage falls back to the labelled synthetic benchmark.

## Before opening a pull request

Run the same checks CI runs:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

All five must pass. `npm run format` fixes formatting automatically.

## What makes a good change here

- **Bugs and honesty fixes first.** If a view shows a number the project cannot back up, that is
  a bug. Fixture data must stay labelled as such.
- **Tests for behaviour, not snapshots.** The interesting logic lives in
  `packages/pipeline` (reducer, statistics, formatting), `apps/dashboard/src/lib`
  (markdown rendering, literature filtering) and `services/api` (orchestrator, evidence chain,
  claim verification, GCI, provider DTO mapping). Add tests there.
- **Never weaken a verification gate to make a test pass.** If `paperSynthesis` refuses to write
  a sentence, the sentence is wrong. The backend map in [`docs/BACKEND.md`](docs/BACKEND.md)
  explains what each gate protects.
- **A change to the backend updates `docs/BACKEND.md` in the same commit.** A stale map is a bug:
  it is what an operator trusts during an incident.
- **No fabricated content.** Do not add publications, DOIs, team members, metrics or
  testimonials that are not real. See [`specs/integrity-rules.md`](specs/integrity-rules.md).
- **Accessibility is part of "done".** Interactive elements need keyboard access and an
  accessible name; decorative graphics need `aria-hidden`.

## Commit messages

Conventional Commits are preferred:

```
fix(dashboard): keep gate approval from mutating fixtures
feat(landing-page): open a prefilled issue when no contact endpoint is configured
docs: add implementation status
```

## Reporting security issues

Please do not open a public issue for a vulnerability. See [`SECURITY.md`](SECURITY.md).
