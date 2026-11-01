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

- **The published site is static; deployments are not.** GitHub Pages hosts a fixture-only build of
  the dashboard: it makes no request to any API. A deployment of this repository (see
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)) serves the _live_ bundle and an API behind one origin,
  and that stack is what the rest of this section is about.
- **There is no default mode.** `AEROSCRIBE_AUTH` says how a request is authenticated: `oidc` (a
  verified identity per request), `token` (one shared key, for scripts), or `none` (no credential —
  deliberate for a laptop, unsafe on a network). An unset `AEROSCRIBE_AUTH` still means "`token`
  when `AEROSCRIBE_API_KEY` is set, else `none`", so nothing gets weaker by upgrading.
- **`oidc` is the mode with accounts.** Tokens are validated, never issued: the API fetches the
  issuer's discovery document once, pins the `issuer` in it to the configured one, and verifies the
  bearer token's signature against the keys that document advertises. Asymmetric algorithms only —
  `HS*` would let anyone who can read the JWKS mint tokens — and a token without `exp` is refused.
  There is no password, no session table and no refresh endpoint: an expired token means a new
  login, which is also what makes logout a matter of forgetting one string.
- **Roles are decided by the server, from the token's `sub`.** `researcher` owns what it creates;
  `reviewer` may read any run and decide any gate but produces nothing; `admin` may do everything,
  including changing a role. Ownership is `ownerSub` on the run document. A refusal is `403` and
  names the role that would have been enough.
- **The audit actor is the verified subject, not the request body.** In `oidc` mode a body claiming
  `actor: "someone-else"` is ignored and the entry records `user:<sub>`. Before accounts that string
  was the caller's own word, which meant any caller could approve a gate in someone else's name.
- **An unreachable issuer is `503`, not `401`.** `401` would log every person out during an IdP
  outage and hide the fault; `503 auth_unavailable` names the issuer instead.
- **The browser holds a token, never a key.** In `oidc` mode the dashboard keeps a short-lived
  access token in `sessionStorage` (it dies with the tab) and obtains it through Authorization Code +
  PKCE — S256 challenge, `state` checked on the callback, verifier consumed and never in a URL, no
  client secret, because a public client has none. In `token` mode the browser holds nothing and the
  edge injects the key server-side, only for a request that brought no `Authorization` header.
- **No secret reaches the browser.** Both apps are built without any key; the Semantic Scholar key
  is read server-side only, and `services/api/test/config.test.ts` asserts it never appears in a
  capability response. Any operator-supplied `VITE_*` value is public by definition.
- **Inputs are bounded and contained.** 1 MiB request bodies, 300-character topics, fixed
  `GATE-n` identifiers, run ids validated against `^[A-Za-z0-9._-]+$` before any path is built,
  and a solver spawned with an absolute path and a wall-clock limit.
- **The evidence trail is append-only and hash-chained**, so a rewritten record is detectable even
  by someone with filesystem access; `GET /api/v1/evidence/verify` is the check.
- The dashboard settings view is read-only and never accepts or stores API keys.
- Accounts are append-only on the filesystem adapter (a role change is a new line) and a `users`
  table with a `CHECK` constraint on Postgres. A login can promote from `AEROSCRIBE_ADMIN_SUBS` and
  can never demote, so a token is not a way to change what somebody may do.
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
