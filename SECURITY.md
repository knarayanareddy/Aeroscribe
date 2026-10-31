# Security policy

## Supported versions

This repository is a prototype. Only the `main` branch receives fixes.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/knarayanareddy/Aeroscribe/security/advisories/new)
rather than in a public issue. Include the affected page or file, reproduction steps, and what an
attacker could achieve. You should get a response within seven days.

## Scope

Things worth reporting:

- Cross-site scripting in the landing page or dashboard (for example a markdown path that renders
  HTML, or a URL that escapes an `href`).
- Any path where a secret, token or credential could reach the browser bundle or the repository.
- **Paths that write outside `AEROSCRIBE_DATA_DIR`** — a run id, mesh level or artefact name that
  escapes the data directory and writes, reads or deletes an arbitrary file.
- **Gate bypass** — any request sequence that moves a run past a `gate_pending` stage without an
  approval, or edits the evidence registry without `/api/v1/evidence/verify` reporting it.
- **Claim escape** — text that reaches a manuscript or a submission package carrying a number no
  evidence record backs.
- Dependency vulnerabilities with a plausible exploit path in this codebase.

## Design decisions that limit exposure

These describe the code as it is, not as it is planned.

- **The deployed site is static.** GitHub Pages hosts the landing page and the dashboard; neither
  makes a request to the API, so the published site exposes no server-side surface.
- **The API is not deployed by this repository.** `services/api` runs where an operator starts it
  (laptop, container). `/health` states whether authentication is on, and an unset
  `AEROSCRIBE_API_KEY` means **no** authentication — deliberate for local use, unsafe on a network.
- **One shared bearer token, compared in constant time.** There are no accounts and no per-user
  data; anyone holding the token can do what the service can do. This is a known limitation, not
  an oversight — see [`docs/ROADMAP.md`](docs/ROADMAP.md) §10.
- **No secret reaches the browser.** Both apps are built without any key; the Semantic Scholar key
  is read server-side only, and `services/api/test/config.test.ts` asserts it never appears in a
  capability response. Any operator-supplied `VITE_*` value is public by definition.
- **Inputs are bounded and contained.** 1 MiB request bodies, 300-character topics, fixed
  `GATE-n` identifiers, run ids validated against `^[A-Za-z0-9._-]+$` before any path is built,
  and a solver spawned with an absolute path and a wall-clock limit.
- **The evidence trail is append-only and hash-chained**, so a rewritten record is detectable even
  by someone with filesystem access; `GET /api/v1/evidence/verify` is the check.
- The dashboard settings view is read-only and never accepts or stores API keys.
- Wiki markdown is rendered as React elements; the project does not use `dangerouslySetInnerHTML`.
- Fixture data is synthetic; no personal data of real researchers is stored.

## Out of scope

- The accuracy or scientific validity of the prototype's illustrative data — it is not real data
  (see [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)).
- Denial of service against the static GitHub Pages host.
- Misconfiguration of a self-hosted deployment: running the API without `AEROSCRIBE_API_KEY` on a
  public interface, or publishing a data directory. Both are documented as unsafe in
  [`docs/BACKEND.md`](docs/BACKEND.md) § 9.
- Multi-user authorisation, because there are no users yet
  ([`docs/ROADMAP.md`](docs/ROADMAP.md) §10).
