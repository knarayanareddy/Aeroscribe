# Operations

How to run AeroScribe's API, where its state lives, and what to do when something is wrong.
This document describes what the code does today. Anything not built is in the last section
rather than implied by silence.

Companion documents: [`BACKEND.md`](./BACKEND.md) for the request path and the integrity
rules, [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for what is and is not
implemented.

---

## 1. The shape of a deployment

One API process and one place its state lives. The state is either a directory
(`AEROSCRIBE_STORE=filesystem`) or a Postgres database (`AEROSCRIBE_STORE=postgres`).

| What                | Filesystem                  | Postgres                       |
| ------------------- | --------------------------- | ------------------------------ |
| Runs                | `runs/<runId>.json`         | `runs.doc`                     |
| Run options         | `runs/<runId>.options.json` | `run_options.doc`              |
| Evidence chain      | `registry.ndjson`           | `evidence`                     |
| Audit trail         | `audit.ndjson`              | `audit`                        |
| CFD working dirs    | `cfd/`                      | `cfd/` (still local)           |
| Rendered manuscript | `manuscripts/<runId>/`      | `manuscripts/<runId>/` (local) |
| Writers             | **one process**             | many                           |

`/health` reports which one is in use, and whether it answered. CFD studies and rendered
manuscripts stay on local disk in both modes: they are working files, and the durable record
of what they produced is the SHA-256 in the evidence chain. Object storage for them is
ROADMAP § 8 D4 and is not built.

---

## 2. First run

```sh
npm ci
npm run start:api            # http://127.0.0.1:8787, data in ./data
curl -s localhost:8787/health | jq .store
```

You will see `{"backend":"filesystem","ok":true,"detail":"the data directory … is writable"}`.
The probe writes and removes a marker file: `ok:true` means a write actually landed.

Set `AEROSCRIBE_API_KEY` before exposing the port to anything. With it unset the API is open
and `/health` says `authRequired:false`.

---

## 3. Postgres

### Provision

```sh
export AEROSCRIBE_STORE=postgres
export AEROSCRIBE_DATABASE_URL='postgres://aeroscribe:…@db.internal:5432/aeroscribe'
npm run db:migrate
```

`db:migrate` applies `services/api/src/store/postgres/migrations/*.sql` in file-name order,
one transaction each, recording each version in `schema_migrations`. It is safe to re-run and
safe to run from a deploy hook; a second run prints `nothing to do`.

Give the application role `INSERT`/`SELECT` on `evidence`. It does not need `UPDATE` or
`DELETE`: a trigger raises on both, and on `TRUNCATE`. The trigger exists so that a bug — or
a `psql` session — cannot rewrite history.

### Verify

```sh
npm run db:verify
```

Reads every record over a fresh connection and recomputes the chain, independent of the API
process. Exit `0` prints the record count and head hash; exit `1` names the first broken
sequence number. Run it after a restore, after an import, and whenever the API has been
restarted by hand.

### Import an existing filesystem deployment

```sh
npm run db:import -- /var/lib/aeroscribe
```

Refuses a database that already has evidence — two chains have no defined merge — and inserts
every record with its original `seq`, `id`, `prevHash`, `hash` and `createdAt`. It then
verifies the result and exits non-zero if the imported chain does not verify. The import is
one-way, so the rollback procedure is the honest one: **keep the files where they are and do
not cut over** until `db:import` prints `verified`. Cutting over is setting
`AEROSCRIBE_STORE=postgres` and restarting; there is no automatic dual-write and no
synchronisation in either direction.

### Roll back

Point `AEROSCRIBE_STORE` back to `filesystem` with the data directory still populated. Any
run created while Postgres was live exists only there — copy it out with `psql` before
switching back if it matters.

---

## 4. Health and what it means

| `GET /health`                          | Meaning                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `200`, `store.ok:true`                 | The process can write. Everything reported is current.                                                                               |
| `503`, `store.ok:false`                | The configured store did not answer, or the data directory is not writable. **Writes will fail**; the message names what was probed. |
| `authRequired:false`                   | `AEROSCRIBE_API_KEY` is unset. Anyone who can reach the port can drive the pipeline.                                                 |
| `capabilities.cfd.su2.available:false` | Stage 4 will run the synthetic benchmark and label it.                                                                               |
| `capabilities.latex.available:false`   | Stage 8 will write the `.tex` and block on the missing PDF.                                                                          |

Writes against an unreachable database return `503 store_unavailable`. Nothing is written to
disk as a fallback and no partial record is left behind.

---

## 5. Backup and restore

The evidence chain is the thing that cannot be reconstructed. Everything else can be
regenerated by re-running the pipeline.

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
curl -s localhost:8787/api/v1/evidence/verify   # or the API's own check
```

A restore is not finished until verification passes. A backup that will not verify is a
backup of a broken chain, and restoring it silently would spread the damage to the next
deployment.

---

## 6. Keys

- `AEROSCRIBE_API_KEY` — one bearer token, checked in constant time. Rotate by setting the new
  value and restarting; there is no overlap window, so brief both-values-accepted rotation is
  not available (single token, see `IMPLEMENTATION_STATUS.md` → Authentication).
- `SEMANTIC_SCHOLAR_API_KEY` — server-side only, never sent to a browser and masked in logs.
- The database password lives in `AEROSCRIBE_DATABASE_URL`. It is redacted before appearing
  in `/health`, capabilities, logs or errors.

---

## 7. DOI re-checks

Verification is never automatic. Schedule it from cron:

```cron
0 3 * * *  cd /srv/aeroscribe && AEROSCRIBE_CONTACT_EMAIL=ops@example.org npm run recheck -- --all >/var/log/aeroscribe-recheck.log 2>&1
```

Exit code `1` means at least one DOI is `broken` or `mismatch`. Stage 8 refuses to submit a
run whose references are in that state, so a red exit here is an incident, not a warning.

---

## 8. When verification fails

1. `npm run db:verify` (or `GET /api/v1/evidence/verify` on a filesystem deployment) names the
   first broken sequence number and the reason.
2. Preserve the database or file **as it is** before investigating. Do not "repair" the chain:
   the records are immutable by design, and an edit that makes the check pass destroys the
   evidence of whatever happened.
3. Every artefact produced at or after that sequence is unverified. Stage 8 will block anyway;
   the point of step 2 is that a human, not the software, decides what to do about it.
4. Record the incident in the audit trail once the cause is known, so the next reader sees a
   timestamped explanation next to the break.

`db:verify` reports an unreachable database as an error, never as "valid": a chain nobody
could read is not a chain that passed.

---

## 9. Not built

Stated here so nobody assumes it exists:

- **No horizontal scale for the filesystem adapter.** Two processes against one directory
  interleave writes. `postgres` supports multiple writers; `filesystem` does not, and
  `/health` names the backend so this is visible.
- **No shared rate limiter.** 60 req/min per process. Redis is ROADMAP § 8 D3 and is not
  built; there is no `AEROSCRIBE_REDIS_URL`.
- **No in-flight run lock across instances.** The orchestrator's guard is per process, so two
  API instances can both advance the same run. Postgres serialises _evidence appends_, not
  stage execution; a shared lock is D3.
- **No object storage.** CFD artefacts and rendered manuscripts are local files; the durable
  record is their SHA-256 in the chain. D4 is not built.
- **No migrations backwards.** Each migration is forward-only. Rolling back a release means
  restoring a dump taken before it.
- **No scheduler.** Re-checks run from cron (§ 7); the API has no timers.
