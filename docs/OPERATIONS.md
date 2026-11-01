# Operations

How to run Aeroscribe, and what to do when it stops being healthy. Written for whoever is on
call, not for whoever wrote the code.

Everything here was run before it was written down. Where something is not built, section 10
says so instead of describing how it would work.

---

## 1. The shape of a deployment

| Component            | What it is                                      | Where its state lives                                               |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `@aeroscribe/api`    | the HTTP API and the pipeline                   | `AEROSCRIBE_DATA_DIR`, or Postgres, or both                         |
| `apps/dashboard`     | static assets; **not wired to the API yet**     | nothing                                                             |
| Evidence chain       | append-only, hash-chained records               | `registry.ndjson` or the `evidence` table                           |
| Runs and audit trail | one document per run; one line per state change | `runs/` + `audit.ndjson`, or two tables                             |
| Artefacts            | CFD working directories, rendered manuscripts   | under `AEROSCRIBE_DATA_DIR` (D4 would move these to object storage) |

Three settings decide almost everything:

```sh
AEROSCRIBE_STORE=filesystem|postgres      # where runs, evidence and audit are kept
AEROSCRIBE_DATABASE_URL=postgres://…      # required by postgres
AEROSCRIBE_COORDINATION=process|redis     # where the rate limit and stage lock live
AEROSCRIBE_REDIS_URL=redis://…            # required by redis
```

Each pair is all-or-nothing: the backend without its URL, or the URL without the backend, stops
the process at boot with one sentence. That is deliberate — a process that quietly ignores a
configured database, or quietly counts its own requests while a shared limiter was expected, is
worse than one that refuses to start.

**What stays local in every mode:** CFD working directories and rendered manuscripts keep
changing while a run is in flight, so they are files. Their durable record is the SHA-256 in the
evidence chain. Object storage is section 10.

---

## 2. First run

```sh
npm ci
cp services/api/.env.example services/api/.env   # then edit it
npm run start:api                               # binds 127.0.0.1:8787
curl -s localhost:8787/health | jq .
```

A first `200` means the process can write: the store probe really wrote and removed a file, or
really opened a database connection. `503` names what failed. There is no "healthy but
degraded" state that still accepts writes.

The dashboard is a separate build (`npm run build -w @aeroscribe/dashboard`) and is **not wired
to the API** in this version; it renders recorded fixtures. Do not treat it as a monitoring
surface.

---

## 3. Postgres

```sh
export AEROSCRIBE_STORE=postgres
export AEROSCRIBE_DATABASE_URL='postgres://aeroscribe:…@db:5432/aeroscribe'

npm run db:migrate                          # idempotent: re-running applies nothing
npm run db:migrate                          # → "nothing to do"
npm run db:verify                           # recomputes the whole chain, exits 1 on a break
npm run db:import -- ./data                 # copy a filesystem deployment in, verbatim
```

- Migrations are applied in file-name order, one transaction each, recorded in
  `schema_migrations`. There are no down-migrations; a rollback is a restore (section 5).
- `db:import` copies records with their original `seq`, `id`, `prevHash`, `hash` and
  `createdAt`, then re-verifies the result. It refuses a non-empty target: two chains have no
  defined merge. It is one-way — the rollback is "keep writing files until the import verifies".
- The `evidence` table is append-only **in the database**: `UPDATE`, `DELETE` and `TRUNCATE`
  raise `the evidence registry is append-only: …`. The hash chain is the independent check for
  anyone who drops the trigger.

---

## 4. Health and what it means

| `GET /health`                          | Meaning                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `200`, `store.ok:true`                 | The process can write. Everything reported is current.                                                                         |
| `503`, `store.ok:false`                | The configured store did not answer, or the data directory is not writable. **Writes will fail**; the message names the probe. |
| `503`, `coordination.ok:false`         | Redis was configured and did not answer. Requests are refused (`503 coordination_unavailable`) rather than let through.        |
| `503`, `blobs.ok:false`                | The artefact directory is not writable: stages can still record digests, but their bytes cannot be stored or fetched.          |
| `coordination.backend:"process"`       | Rate limits and the stage lock are per instance: two replicas each get 60 req/min and may run the same stage.                  |
| `authRequired:false`                   | `AEROSCRIBE_API_KEY` is unset. Anyone who can reach the port can drive the pipeline.                                           |
| `capabilities.cfd.su2.available:false` | Stage 4 runs the synthetic benchmark and labels the output as such.                                                            |
| `capabilities.latex.available:false`   | Stage 8 writes the `.tex` and blocks on the missing PDF.                                                                       |

Writes against an unreachable database return `503 store_unavailable`. Nothing is written to
disk as a fallback and no partial record is left behind.

A Redis outage is a refusal, not a retry: the rate limiter answers `503` rather than counting
locally, because a limit nobody enforces is worse than a clear failure. When Redis returns the
client reconnects with backoff and `/health` flips back to `200` without a restart.

---

## 5. Backup and restore

The evidence chain is the thing that cannot be reconstructed; everything else is regenerated by
re-running the pipeline.

**Postgres**

```sh
pg_dump --format=custom --file=aeroscribe-$(date +%F).dump "$AEROSCRIBE_DATABASE_URL"
pg_restore --clean --if-exists --dbname="$AEROSCRIBE_DATABASE_URL" aeroscribe-2026-11-01.dump
npm run db:verify
```

**Filesystem**

```sh
tar -czf aeroscribe-$(date +%F).tar.gz -C /var/lib aeroscribe
# restore into an empty directory, then:
curl -s localhost:8787/api/v1/evidence/verify
```

A restore is not finished until verification passes. A backup that will not verify is a backup
of a broken chain, and restoring it silently would spread the damage to the next deployment.

---

## 6. Redis (rate limit and stage lock)

Set both variables when more than one API instance runs behind a load balancer:

```sh
export AEROSCRIBE_COORDINATION=redis
export AEROSCRIBE_REDIS_URL='redis://:password@redis:6379/0'
curl -s localhost:8787/health | jq .coordination
```

| Key pattern                     | Contents                     | Lifetime                                               |
| ------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `aeroscribe:ratelimit:<client>` | one counter per client       | the rate window (`PEXPIRE` on first hit, 60 s)         |
| `aeroscribe:runlock:<runId>`    | the owner of the run’s stage | 30 s, extended by a heartbeat every 10 s while it runs |

Nothing durable lives there. Flushing the database loses at most one rate window and one
in-flight lease; the next `advance` for that run succeeds once the lease expires, which is why
the TTL matters.

Use a Redis that will not evict these keys — `noeviction` or a dedicated database. A lock
evicted early means two instances can run the same stage; that is a correctness failure, not a
capacity trade-off.

---

## 7. Artefacts

Stage 4 stores the bytes it hashed under `<AEROSCRIBE_DATA_DIR>/blobs/sha256/<aa>/<rest>`, and
the record carries the digest, size and media type:

```sh
curl -s -o study.json -D - \
  localhost:8787/api/v1/evidence/12/artefacts/gci-study.json
# x-content-sha256: <the digest the record holds>
sha256sum study.json    # must match, or the API would have answered 409
```

| Answer | What to do                                                                                    |
| ------ | --------------------------------------------------------------------------------------------- |
| `200`  | Keep the file; compare `sha256sum` with the `x-content-sha256` header if it matters.          |
| `409`  | The bytes on disk no longer match the chain. Preserve them and follow § 10; do not re-export. |
| `404`  | Wrong name, or a record whose bytes were never stored (records written before this existed).  |

Back the blobs up with the rest of the data directory or dump. A restore that brings back the
registry but not `blobs/` still verifies — the chain only covers digests — but every artefact
fetch then answers `404`, which is why § 5 restores both together.

---

## 8. Keys

- `AEROSCRIBE_API_KEY` — one bearer token, compared in constant time. Rotate by setting the new
  value and restarting; there is no overlap window (single token).
- `SEMANTIC_SCHOLAR_API_KEY` — server-side only, never sent to a browser, masked in logs.
- The database password lives in `AEROSCRIBE_DATABASE_URL`, the Redis password in
  `AEROSCRIBE_REDIS_URL`. Both are redacted (`redactDatabaseUrl`, `redactRedisUrl`) before
  appearing in `/health`, capabilities, logs or error messages.

---

## 9. DOI re-checks

Verification is never automatic. Schedule it from cron:

```cron
0 3 * * *  cd /srv/aeroscribe && AEROSCRIBE_CONTACT_EMAIL=ops@example.org npm run recheck -- --all >/var/log/aeroscribe-recheck.log 2>&1
```

Exit code `1` means at least one DOI is `broken` or `mismatch`. Stage 8 refuses to submit a run
whose references are in that state, so a red exit here is an incident, not a warning.

---

## 10. When verification fails

1. `npm run db:verify` (or `GET /api/v1/evidence/verify` on a filesystem deployment) names the
   first broken sequence number and the reason.
2. Preserve the database or file **as it is** before investigating. Do not "repair" the chain:
   the records are immutable by design, and an edit that makes the check pass destroys the
   evidence of whatever happened.
3. Every artefact produced at or after that sequence is unverified. Stage 8 blocks anyway; the
   point of step 2 is that a human, not the software, decides what to do.
4. Record the incident in the audit trail once the cause is known, so the next reader sees a
   timestamped explanation next to the break.

`db:verify` reports an unreachable database as an error, never as "valid": a chain nobody could
read is not a chain that passed.

---

## 11. Not built

Stated here so nobody assumes it exists:

- **No horizontal scale for the filesystem adapter.** Two processes against one directory
  interleave writes. `postgres` supports multiple writers; `filesystem` does not, and `/health`
  names the backend so this is visible.
- **No shared rate limiter or run lock unless `AEROSCRIBE_COORDINATION=redis`.** With the
  default `process`, two replicas each get 60 req/min and can both advance the same run; the
  `/health` body names the backend. With `redis`, both are shared — and a Redis outage makes the
  API answer `503` rather than silently falling back to per-process counting.
- **No object storage.** Artefact bytes are content-addressed local files; the endpoint
  re-hashes them on the way out, but a deployment cannot share them between hosts, and a
  redeploy without a volume loses them (the chain still verifies; the fetches 404). S3/MinIO is
  D4b and is not built.
- **No migrations backwards.** Forward-only. Rolling back a release means restoring a dump
  taken before it.
- **No scheduler.** Nothing advances a run or re-checks a DOI on its own; both are cron or
  operator actions.
