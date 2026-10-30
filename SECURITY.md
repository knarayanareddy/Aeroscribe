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
- Dependency vulnerabilities with a plausible exploit path in this codebase.

## Design decisions that limit exposure

- No authentication, database or backend exists, so there is no server-side credential to steal.
- The dashboard settings view is read-only and never accepts or stores API keys.
- Wiki markdown is rendered as React elements; the project does not use
  `dangerouslySetInnerHTML`.
- Fixture data is synthetic; no personal data of real researchers is stored.

## Out of scope

- The accuracy or scientific validity of the prototype's illustrative data — it is not real data
  (see [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)).
- Denial of service against the static GitHub Pages host.
