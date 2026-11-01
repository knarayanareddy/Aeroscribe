# Deployment

How a release reaches a host, what the host runs, and what each environment is allowed to claim.

Deployment is where a prototype starts making promises, so this document is written the same way
as [`OPERATIONS.md`](OPERATIONS.md): every command was run before it was written down, **except
where § 11 says it was not**. The image build, the compose stack and the two deploy workflows have
never executed in an environment with a Docker daemon or a remote host. They are specified, reviewed
and statically checked; they are not proven. Nothing below claims otherwise.

---

## 1. What runs where

| Environment           | What it is                                                | Dashboard it serves             | Status                  |
| --------------------- | --------------------------------------------------------- | ------------------------------- | ----------------------- |
| **GitHub Pages**      | the landing page, plus the dashboard as a sub-app         | the **fixture** build           | live                    |
| **Local (`compose`)** | the whole stack on one machine, TLS by Caddy              | the **live** build, same origin | written, not run here   |
| **Staging**           | the same stack on a host, deployed by `Deploy to staging` | the **live** build, same origin | written, never deployed |
| **Production**        | the same stack, deployed only with a reviewer's approval  | the **live** build, same origin | written, never deployed |

**GitHub Pages hosts the fixture-only dashboard.** `deploy.yml` builds with `VITE_API_URL`
unset, so that bundle contains no API address and every screen carries the "Fixtures · illustrative
data" label. It is a demonstration of the interface, not a window into a deployment, and nothing in
this document turns it into one.

The compose stack is the opposite: its dashboard image is built with `VITE_API_URL=` — present and
empty — which means _this origin_. The browser calls `/api/v1/…` on the page it already loaded, and
Caddy adds the bearer token on the way in (§ 3).

---

## 2. The stack

[`compose.yaml`](../compose.yaml) is the local stack and the deployed stack. There is no second
compose file for production: the difference between a laptop and a host is the `.env`, not the
topology.

| Service    | Image                                      | Networks           | Listens on                              |
| ---------- | ------------------------------------------ | ------------------ | --------------------------------------- |
| `caddy`    | `aeroscribe-dashboard` (built) or GHCR tag | `internal`, `edge` | `80`, `443` — the only published ports  |
| `api`      | `aeroscribe-api` (built) or GHCR tag       | `internal`, `edge` | `8787`, inside the network only         |
| `migrate`  | the API image, one shot                    | `internal`         | nothing; runs `db-migrate.ts` and exits |
| `postgres` | `postgres:16-alpine`                       | `internal`         | `5432`, inside the network only         |
| `redis`    | `redis:7-alpine`                           | `internal`         | `6379`, inside the network only         |

Four decisions worth stating, because each one is a failure that cannot happen:

- **Only the edge publishes a port.** `docker compose port api` is empty. A published `8787` would
  bypass TLS _and_ the key injection that makes the API's authentication work at all.
- **Postgres and Redis are on an `internal: true` network**, which has no route out. The API joins
  `edge` as well, because with `AEROSCRIBE_OFFLINE=false` it has to reach Crossref, arXiv and
  Semantic Scholar.
- **Migrations are a separate service.** `AEROSCRIBE_STORE=postgres` refuses to boot against an
  empty database, and a request-handling process should not be the thing that changes the schema.
  `api` waits on `migrate` with `condition: service_completed_successfully`.
- **There is no MinIO.** ROADMAP § 9 sketched one, but the API has no object-storage adapter
  (D4b is unbuilt), so a bucket in this file would be a service nothing talks to. Artefact bytes are
  the `api-data` volume; the chain holds their digests. When D4b lands, it becomes a service here and
  a variable in `.env.example`.

Volumes: `postgres-data`, `api-data` (artefact blobs and CFD study directories), `caddy-data` and
`caddy-config` (certificates and the ACME account, so a restart does not re-request one).

---

## 3. What "live" means for the dashboard

The source is chosen **at build time**, in `apps/dashboard/src/state/sourceFromEnv.ts`, from a single
variable:

| `VITE_API_URL`      | Build              | Behaviour                                                              |
| ------------------- | ------------------ | ---------------------------------------------------------------------- |
| unset (or omitted)  | fixture            | bundled fixture corpus; every screen says the numbers are illustrative |
| `''` (empty string) | live, same origin  | calls `/api/v1/…` on the page's own origin                             |
| `https://api.…`     | live, cross origin | calls that origin; CORS would have to allow it                         |

All nine views have a live implementation — Overview, Pipeline, Literature, Novelty, CFD,
Manuscript, Review, Wiki and Settings — and each one reads a record the server actually wrote
(`docs/IMPLEMENTATION_STATUS.md` § "Live mode" lists the endpoint behind every view). An unreachable
API shows `API unreachable · <reason>` and an empty table; it never falls back to fixtures under a
live badge.

**The key never reaches the browser.** A token in a bundle is a leaked token
(RULE-040), so the client sends no `Authorization` header in the same-origin build and
`docker/Caddyfile` adds one:

```caddyfile
handle /api/* {
    reverse_proxy api:8787 {
        header_up Authorization "Bearer {$AEROSCRIBE_API_KEY}"
        header_up X-Forwarded-For {remote_host}
    }
}
```

That is the same arrangement the Vite dev proxy uses, and it means the API key in this topology is a
_server-side_ credential: the edge is the only client that holds it.

What is **not** proven: there is no browser-driven end-to-end test in this repository. The live views
are covered by component tests against a stub source (`apps/dashboard/src/components/LiveViews.test.tsx`,
22 tests), and the same-origin arrangement has been exercised at the HTTP level (§ 11); nobody has
clicked through a deployed build here.

---

## 4. Running it locally

```sh
cp .env.example .env
openssl rand -hex 32                 # paste into AEROSCRIBE_API_KEY
openssl rand -hex 24                 # paste into AEROSCRIBE_DB_PASSWORD
docker compose up -d --build
open https://localhost               # Caddy's internal CA: the browser warns once

AEROSCRIBE_API_KEY="$(grep '^AEROSCRIBE_API_KEY=' .env | cut -d= -f2-)" \
  scripts/smoke-deploy.sh https://localhost --insecure \
    --expect-auth --expect-solver synthetic
```

Two settings have no default and stop `docker compose up` before it starts: `AEROSCRIBE_API_KEY` and
`AEROSCRIBE_DB_PASSWORD`. That is the `:?` in the compose file — a stack with no token is a stack
anyone on the network can drive, and a default password is a published password.

`--insecure` accepts Caddy's self-signed certificate. It exists for a local or pre-certificate
staging host, prints a warning every time, and is not reachable from the production workflow (§ 7).

---

## 5. Environments, secrets and the reviewer gate

Two GitHub **environments** — `staging` and `production` — are what make the reviewer requirement a
property of the platform instead of a sentence in a workflow. A workflow that declares an environment
receives its secrets only after that environment's protection rules are satisfied.

Set them up once, in the repository UI:

1. **Settings → Environments → New environment → `staging`.** No protection rules.
2. **Settings → Environments → New environment → `production`.**
   - **Required reviewers**: add the people who may release. This is the toggle that makes
     "a production deploy cannot start without a reviewer" true — with it off, the workflow starts
     immediately and the promise is empty.
   - **Deployment branches and tags**: _Selected branches and tags_ → add `main` (and the `v*` tag
     pattern if the deploy runs against the tag ref). Without this, any branch can deploy.
   - **Wait timer** (optional): a delay between approval and the deploy, if a release should be a
     scheduled event rather than an immediate one.
3. **Settings → Actions → General → Workflow permissions**: leave it at read-repository; the
   workflows ask for what they need per file (`packages: write` only in `release-api.yml`).

The workflows read these. Nothing is read from the repository's default secrets, so a reviewer's
approval cannot be bypassed by a job that forgot to declare `environment:` — it would find no
secrets and stop at the "required configuration is present" step.

**Secrets** (per environment, both need the same names):

| Secret                       | What it is                                                    |
| ---------------------------- | ------------------------------------------------------------- |
| `AEROSCRIBE_SSH_HOST`        | the host to deploy to                                         |
| `AEROSCRIBE_SSH_USER`        | a user that can run `docker` (in the `docker` group, or root) |
| `AEROSCRIBE_SSH_KEY`         | its private key, no passphrase                                |
| `AEROSCRIBE_SSH_KNOWN_HOSTS` | the host's public key line, pinned by hand                    |
| `AEROSCRIBE_API_KEY`         | the bearer token the API requires                             |
| `AEROSCRIBE_DB_PASSWORD`     | the Postgres password                                         |
| `SEMANTIC_SCHOLAR_API_KEY`   | optional; raises the Semantic Scholar rate allowance          |

`AEROSCRIBE_SSH_KNOWN_HOSTS` is a secret rather than a `ssh-keyscan`: scanning the host during a
deploy trusts whoever answers first, which is the attack host-key checking exists to prevent.

**Variables** (per environment):

| Variable                       | Default                            | Used by                                          |
| ------------------------------ | ---------------------------------- | ------------------------------------------------ |
| `AEROSCRIBE_STAGING_URL`       | —                                  | staging smoke test and deploy URL                |
| `AEROSCRIBE_STAGING_DOMAIN`    | `localhost`                        | the certificate Caddy obtains                    |
| `AEROSCRIBE_STAGING_INSECURE`  | `false`                            | staging only: accept a self-signed certificate   |
| `AEROSCRIBE_PRODUCTION_URL`    | —                                  | production smoke test and deploy URL             |
| `AEROSCRIBE_PRODUCTION_DOMAIN` | — (required)                       | the certificate Caddy obtains                    |
| `AEROSCRIBE_DEPLOY_PATH`       | `/opt/aeroscribe`                  | where `compose.yaml` and `.env` live on the host |
| `AEROSCRIBE_CONTACT_EMAIL`     | —                                  | Crossref polite pool                             |
| `AEROSCRIBE_OFFLINE`           | `true` staging, `false` production | literature mode                                  |

Rotation is a redeploy: change the secret or variable, re-run the workflow. The `.env` on the host is
rewritten from the environment every time, so there is no second copy to forget. Updating
`AEROSCRIBE_API_KEY` also changes what Caddy injects; both containers are recreated in the same
`compose up`.

---

## 6. TLS

Caddy terminates TLS. With `AEROSCRIBE_DOMAIN` set to a name whose DNS A/AAAA record points at the
host, it obtains and renews a certificate from Let's Encrypt over the ACME HTTP-01/TLS-ALPN challenge,
which is why ports **80 and 443 must be reachable from the internet**. The ACME account and
certificates live in the `caddy-data` volume — losing it means re-issuing, not breaking.

With `AEROSCRIBE_DOMAIN` left at `localhost`, Caddy issues itself a certificate from its internal CA.
That is the right behaviour for a laptop and the wrong behaviour for anything reachable; a staging
host with no public name needs `AEROSCRIBE_STAGING_INSECURE=true` to be smoke-tested, which prints a
warning and is deliberately absent from the production workflow.

Two things this document does not do: it does not set HSTS (a header that cannot be taken back from
browsers should be a deliberate decision, not a default buried in a proxy config), and it does not
describe a TLS-terminating load balancer in front of Caddy — if you add one, the certificate belongs
there and Caddy should be bound to the internal network only.

---

## 7. From a tag to production

```
tag v0.3.0
   │
   ├─ Release images ──── build api + dashboard, linux/amd64+arm64, SBOM + provenance
   │                      boot the published digest → scripts/smoke-deploy.sh → digest in the summary
   │
   ├─ Deploy to staging ─ dispatch(tag, solver): ship compose.yaml + .env, pull, up, smoke
   │                      green ⇒ the tag is deployable
   │
   └─ Deploy to production ─ dispatch(tag, digest, confirm, solver) → reviewer approves
                              → verify the host runs that digest → smoke
```

**`Release images`** ([`.github/workflows/release-api.yml`](../.github/workflows/release-api.yml))
runs on a `v*` tag or on dispatch against one; it refuses any other ref, and asserts the tag is an
ancestor of `origin/main` before building. It publishes
`ghcr.io/<owner>/aeroscribe-api` and `ghcr.io/<owner>/aeroscribe-dashboard` with semver,
`<major>.<minor>`, `sha-…` and `latest` tags, `provenance: true` and `sbom: true` — attestations
attached to the digest, not loose files. The `verify` job then pulls **by digest**, boots the container
on `:8787` offline, and runs the smoke script; a tag whose image cannot pass its own smoke is not a
release yet.

**`Deploy to staging`** ([`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml))
is dispatch-only. It ships `compose.yaml`, the Dockerfiles and `docker/Caddyfile` to
`AEROSCRIBE_DEPLOY_PATH`, writes `.env` from the environment's secrets and variables, logs in to GHCR,
`docker compose pull`, `docker compose up -d --no-build`, then runs
`scripts/smoke-deploy.sh` against `AEROSCRIBE_STAGING_URL`.

**`Deploy to production`** ([`.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml))
is the same procedure behind three gates: dispatch-only, the `production` environment's required
reviewers, and a `confirm` input that must equal the tag. It accepts the **digest** staging proved,
and when one is given it verifies on the host that the running container's `RepoDigests` contains it
before smoking — a tag can be re-pushed, a digest cannot.

**What the smoke test asserts** (`scripts/smoke-deploy.sh`, exit 0/1/2/3):

| Check                                                     | Why a deploy deserves to fail for it                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/health` answers 200                                     | and reports the version and commit we meant to deploy — a deploy that silently kept the old container is the most common failure there is |
| `authRequired` matches expectation                        | an open API where a key was promised is the other one                                                                                     |
| expected solver is available / absent                     | a stack that cannot solve should say so _before_ the run, not after 30 seconds                                                            |
| evidence chain `valid`                                    | publishing a build that cannot read its own chain is worse than not publishing                                                            |
| a run advances through every stage and parks at each gate | the whole orchestrator, not one endpoint                                                                                                  |
| stage 8 is **blocked** and names the synthetic solver     | the honesty contract: a deploy that ever reports a synthetic run as submittable fails                                                     |
| the `cfd-run` record's `solver` matches expectation       | the label in the registry, not only the one in `/health`                                                                                  |

Failure blocks promotion: the smoke step is the last thing staging does, and production is a separate
dispatch that a human starts afterwards.

---

## 8. Backup and restore

The evidence chain is the part that cannot be recomputed. Two things back it up, and they have to be
restored together:

```sh
# On the host. Both commands read the stack's own credentials, so the password
# never appears in a shell history.
docker compose exec -T postgres pg_dump -U aeroscribe --format=custom aeroscribe \
  > aeroscribe-$(date +%F).dump
docker run --rm -v aeroscribe_api-data:/data -v "$PWD":/backup alpine \
  tar -czf /backup/aeroscribe-data-$(date +%F).tar.gz -C /data .
```

`docs/OPERATIONS.md` § 5 has the filesystem-store equivalent and the reason each restore ends with a
verification, and § 7 explains what a restore without `blobs/` looks like: the chain still verifies —
it covers digests — but every artefact fetch answers `404`. Restore both or the deployment is lying
about what it can produce.

After a restore, verify before serving traffic:

```sh
docker compose run --rm migrate                                  # forward-only, idempotent
docker compose run --rm api npm run db:verify                     # recomputes the chain, exits 1 on a break
curl -fsS https://<host>/api/v1/evidence/verify
```

A backup that will not verify is a backup of a broken chain.

---

## 9. Rollback

**The normal rollback is a redeploy of the previous release.** Re-run _Deploy to production_ with the
previous tag (and its digest, if it was recorded), and approve it like any other deploy:

```
Deploy to production
  tag:    v0.3.0        ← the release that was running
  digest: sha256:…      ← from that release's job summary
  confirm: v0.3.0
```

Both deploy workflows print the image references they found on the host under "Previous release on
the host, for a rollback", so the value to go back to is in the log of the deploy that replaced it.
A rollback is a deploy: it is reviewed, smoked, and recorded.

Rolling back the _code_ does not roll back three other things, and the order matters:

- **Migrations are forward-only.** `db-migrate.ts` applies files in name order and records each in
  `schema_migrations`; there are no down-migrations. An older image against a newer schema is
  unsupported — restore the database dump taken before the upgrade (§ 8) if the older release cannot
  read the newer schema.
- **The evidence chain is append-only.** A rollback does not rewrite or remove records; a run started
  by the newer release stays in the chain, and `db:verify` keeps verifying it. Deleting history to
  make a rollback look clean is exactly what RULE-043 forbids.
- **Artefact bytes outlive the container.** `api-data` is a volume, so a rolled-back image still sees
  the files the newer one wrote. They are content-addressed and referenced by digest, so this is
  harmless — but a backup should still be taken before an upgrade, not after a rollback.

If the failure is in the host rather than the release (a full disk, a dead database), the rollback is
`docker compose down` plus a restore, not a tag.

---

## 10. What a deployed stack cannot do

Stated here because a deployment is where these limits get forgotten.

| Limit                                    | What it looks like in a deployment                                                                                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No SU2 binary**                        | every run uses the labelled synthetic benchmark; the `cfd-run` record says `solver: "synthetic"`, the manuscript is marked `synthetic: true`, and **stage 8 blocks submission**. The published image contains no solver.                                  |
| **No TeX engine**                        | stage 8 writes `manuscript.tex`, records `typeset: "source-only"`, and blocks with "the manuscript PDF was not typeset". The published image is the default build; `INSTALL_LATEX=true` is a local build.                                                 |
| **Offline literature** (`default: true`) | the fixture corpus has no DOIs by design, so RULE-002 means an offline run can never cite anything. Set `AEROSCRIBE_OFFLINE=false` and `AEROSCRIBE_CONTACT_EMAIL` for real Crossref/arXiv/Semantic Scholar traffic.                                       |
| **Single host**                          | artefact bytes are local files; two API replicas do not share them. Postgres shares runs and evidence only if `AEROSCRIBE_STORE=postgres`, and Redis shares the rate limit and stage lock only if `AEROSCRIBE_COORDINATION=redis` — `/health` names both. |
| **Redis is not durable**                 | `--save ''` on purpose: it holds a rate window and a stage lease, nothing worth restoring.                                                                                                                                                                |
| **Wiki edits are session-local**         | the generated article is an evidence record and read-only; editing it is not implemented.                                                                                                                                                                 |

A stack in this state is genuinely useful — it collects evidence, enforces gates, and refuses to
submit what it cannot prove — and it is not a way to produce a journal PDF. `docs/IMPLEMENTATION_STATUS.md`
is the full ledger.

---

## 11. What has actually been run

The deployment surface is the one part of this repository that cannot be exercised on a development
machine. Rather than leave that to inference, here is the ledger.

**Executed, with the output in the pull request that added this document:**

- `scripts/smoke-deploy.sh` against a real API: anonymous and keyed, passing on both, and failing
  loudly on a wrong `--expect-version`, a wrong `--expect-auth`, a wrong `--expect-solver`, and a 401
  without a key. It also walks a run to the end and confirms **stage 8 is blocked and names the
  synthetic solver**.
- The same script over HTTPS against a self-signed certificate: refused with
  `TLS verification failed` and exit 1 without `--insecure`, and a full pass with it.
- The same-origin arrangement, at the HTTP level, with a stand-in for the Caddy rules: `/` serves the
  live bundle; `/api/v1/runs` **with no `Authorization` header** returns `200 {"runs":[]}` through the
  edge and `401` when called directly; a deep link falls back to `index.html`; `/health` proxies.
  A run created through the edge is listed by a following `GET /api/v1/runs`.
- The dashboard's same-origin build (`VITE_API_URL=`): the emitted bundle contains `/api/v1/runs`
  and no `localhost:8787`.
- Every `run:` block in the three workflows, parsed and passed to `bash -n`; `compose.yaml` and all
  three workflows parsed as YAML; `services/api/test/deploy-config.test.ts` compares `compose.yaml`
  to `config.ts`, to `.env.example`, and to the Caddyfile, so a renamed variable or a published port
  fails the suite.

**Written, reviewed and statically checked, but never executed:**

- the GHCR publish (no Docker daemon here, so the multi-arch build, the SBOM and the provenance
  attestation are unproven);
- `docker compose up` and therefore every claim about Caddy, Postgres, Redis and the TLS handshake;
- `Deploy to staging` and `Deploy to production`, including the SSH path, the pinned host key and the
  digest check;
- the `production` environment's required reviewers, which is repository configuration rather than
  anything a file can demonstrate.

Until a tag is released and deployed to a real host, the honest statement is: the release and deploy
_procedure_ is specified and testable, and the smoke test that would judge it works. That is the same
standard this repository applied to D4b — written down as not-run rather than counted as done.

---

## 12. Alternatives to the default host

The default is a single VPS running this compose file, because it needs no account beyond the host
and no service the repository cannot describe. Two alternatives were considered and are recorded as
decisions rather than omissions:

- **Render or Fly.io.** One service for the API plus managed Postgres and Redis. Fewer moving parts
  (no OS patching, managed backups), but the TLS-terminated edge moves to the platform, the `api-data`
  volume has to be a platform disk, and the deploy job becomes a platform API call rather than SSH.
  The compose file does not describe that environment, and this repository has not tested it.
- **Kubernetes.** Out of scope. It would need a chart, a migration `Job`, and a volume story for
  artefact bytes; nothing here has been written for it.

---

## 13. Checklist

Before a first deploy to a new host:

- [ ] `AEROSCRIBE_PRODUCTION_DOMAIN` (or staging) resolves to the host; ports 80 and 443 reach it.
- [ ] The `production` environment has **required reviewers** and a **branch restriction** (§ 5).
- [ ] `AEROSCRIBE_SSH_KNOWN_HOSTS` holds the host's real key (`ssh-keyscan <host>` from a trusted
      network, pasted in by hand — not scanned during the deploy).
- [ ] `AEROSCRIBE_API_KEY` is 32 random bytes from `openssl rand -hex 32`, and the same value as the
      one the stack was last deployed with, or the dashboard's requests start failing at the edge.
- [ ] A first backup has been taken (§ 8) and restored once into a scratch database, so the restore
      path is known to work before it is needed.
- [ ] `scripts/smoke-deploy.sh <url> --expect-auth --expect-solver synthetic` passes by hand before
      trusting the workflow's version of the same command.

---

## Related documents

- [`OPERATIONS.md`](OPERATIONS.md) — health, Postgres, Redis, artefacts, keys, backup, failure modes.
- [`BACKEND.md`](BACKEND.md) — routes, configuration and failure modes of the API itself.
- [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) — what is implemented, what is not, and what
  the labels mean.
- [`../specs/integrity-rules.md`](../specs/integrity-rules.md) — RULE-063 and the rest of the
  enforcement table.
