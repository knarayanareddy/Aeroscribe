#!/usr/bin/env bash
#
# Prove a deployment is alive, honest, and actually running this build.
#
#   scripts/smoke-deploy.sh <base-url> [--expect-version VERSION] [--expect-auth] \
#     [--expect-solver synthetic|su2] [--insecure] [--wait SECONDS]
#
# What it checks, and why each one is worth failing a deploy over:
#
#   1. `GET /health` answers 200 and reports the version and commit we meant to
#      deploy. A deploy that silently kept the old container is the most common
#      failure there is, and a 200 from the previous release looks identical.
#   2. The evidence chain verifies. Publishing a build that cannot read its own
#      chain is worse than not publishing.
#   3. A run can be created, advanced through every stage and parked at each gate
#      — the whole orchestrator, not one endpoint.
#   4. Stage 8 is **blocked** and the blocker names the synthetic solver, when no
#      real solver is configured. This is the honesty contract: if a deploy ever
#      reports a synthetic run as submittable, the deploy fails rather than
#      shipping a plausible-looking result.
#   5. `authRequired` matches what the operator said to expect. Deploying an open
#      API where a key was promised is the other failure worth catching here.
#
# Exit codes: 0 pass, 1 a check failed, 2 bad usage, 3 the server never answered.
#
# Deliberately bash + curl + node: it runs on the deploy host, where nothing but
# the base image exists. No `jq` dependency (node is already there because the
# image is a node image).

set -euo pipefail

BASE_URL="${1:-}"
shift || true

EXPECT_VERSION=""
EXPECT_AUTH=""
EXPECT_SOLVER=""
# `--insecure` accepts the certificate Caddy issues itself for `localhost` or a
# bare name. Only ever for a staging host that has no public certificate yet: the
# alternative there is not checking TLS at all, and this at least makes the
# exception explicit and visible in the run log.
INSECURE=0
# How long to wait for the deployment to answer. Sixty seconds covers a container
# that is still starting; anything longer is a deploy that failed, and waiting
# longer only delays the bad news.
WAIT_SECONDS=60

while [ $# -gt 0 ]; do
  case "$1" in
    --expect-version) EXPECT_VERSION="${2:-}"; shift 2 ;;
    --expect-auth) EXPECT_AUTH="true"; shift ;;
    --expect-anonymous) EXPECT_AUTH="false"; shift ;;
    --expect-solver) EXPECT_SOLVER="${2:-}"; shift 2 ;;
    --wait) WAIT_SECONDS="${2:-60}"; shift 2 ;;
    --insecure) INSECURE=1; shift ;;
    *) echo "smoke-deploy: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$BASE_URL" ]; then
  echo "usage: smoke-deploy.sh <base-url> [--expect-version V] [--expect-auth|--expect-anonymous] [--expect-solver synthetic|su2] [--insecure] [--wait N]" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"

# One place, rather than a flag on each of the fifteen curl calls below: the
# function shadows the binary inside this script, so a call site added later
# cannot forget the exception.
TLS_OPTS=()
if [ "$INSECURE" = 1 ]; then
  TLS_OPTS=(--insecure)
  echo "smoke-deploy: --insecure — the certificate is NOT verified (staging only)" >&2
fi
# `${TLS_OPTS[@]+...}` rather than a bare expansion: with `set -u`, bash before
# 4.4 treats an empty array as unset, and this script is meant to run anywhere.
curl() { command curl ${TLS_OPTS[@]+"${TLS_OPTS[@]}"} "$@"; }

# The API key is read from the environment, never from an argument: a key in
# `ps` output is a leak, and `docker compose exec` shows the command line.
AUTH_HEADER=()
if [ -n "${AEROSCRIBE_API_KEY:-}" ]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${AEROSCRIBE_API_KEY}")
fi

fail() {
  echo "smoke-deploy: FAIL — $*" >&2
  exit 1
}

# `json <path> [default]` — read a value out of stdin with node.
json() {
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      let value;
      try { value = JSON.parse(raw); } catch (error) {
        console.error("not JSON: " + String(error));
        process.exit(1);
      }
      const path = process.argv[1].split(".");
      for (const key of path) {
        if (value === null || value === undefined) { value = undefined; break; }
        value = value[key];
      }
      if (value === undefined) process.stdout.write(process.argv[2] ?? "");
      else if (typeof value === "object") process.stdout.write(JSON.stringify(value));
      else process.stdout.write(String(value));
    });
  ' "$1" "${2:-}"
}

echo "smoke-deploy: ${BASE_URL}"

# ── 1. It answers at all ─────────────────────────────────────────────────────
health=""
last_error=""
for attempt in $(seq 1 "$WAIT_SECONDS"); do
  if health=$(curl -fsS --max-time 10 "${AUTH_HEADER[@]}" "${BASE_URL}/health" 2>/tmp/smoke-deploy-curl.$$); then
    break
  fi
  # curl's TLS diagnostic runs to five lines; the first one names the problem.
  last_error=$(head -n 1 /tmp/smoke-deploy-curl.$$ 2>/dev/null || true)
  # A rejected certificate will still be rejected in a minute. Saying "never
  # answered" for the next sixty seconds hides the one thing the operator has to
  # change, and pointing them at the flag that makes it stop is the honest help.
  case "$last_error" in
    *certificate*|*SSL*|*TLS*)
      echo "smoke-deploy: FAIL — TLS verification failed for ${BASE_URL}" >&2
      echo "  curl: ${last_error}" >&2
      if [ "$INSECURE" = 1 ]; then
        echo "  --insecure is set and the certificate was rejected anyway; the host is not answering TLS." >&2
      else
        echo "  A staging host with a self-signed certificate needs --insecure; production never does." >&2
      fi
      exit 1
      ;;
  esac
  sleep 1
  if [ "$attempt" -eq "$WAIT_SECONDS" ]; then
    echo "smoke-deploy: ${BASE_URL}/health never answered after ${WAIT_SECONDS}s" >&2
    [ -n "$last_error" ] && echo "  last error: ${last_error}" >&2
    exit 3
  fi
done
rm -f "/tmp/smoke-deploy-curl.$$"

VERSION=$(printf '%s' "$health" | json version)
COMMIT=$(printf '%s' "$health" | json commit)
AUTH_REQUIRED=$(printf '%s' "$health" | json authRequired)
STORE=$(printf '%s' "$health" | json store.backend)
COORDINATION=$(printf '%s' "$health" | json coordination.backend)
SOLVER=$(printf '%s' "$health" | json capabilities.cfd.su2.available)

echo "  version=${VERSION} commit=${COMMIT} store=${STORE:-none} coordination=${COORDINATION}"
echo "  authRequired=${AUTH_REQUIRED} su2.available=${SOLVER}"

if [ -n "$EXPECT_VERSION" ] && [ "$VERSION" != "$EXPECT_VERSION" ]; then
  fail "expected version ${EXPECT_VERSION}, the server reports ${VERSION} — this is not the build that was deployed"
fi
if [ -n "$EXPECT_AUTH" ] && [ "$AUTH_REQUIRED" != "$EXPECT_AUTH" ]; then
  fail "expected authRequired=${EXPECT_AUTH}, the server reports ${AUTH_REQUIRED}"
fi

# What the deployment *can* do, checked before spending 30 seconds on a run. The
# smoke run always asks for the synthetic solver; this says whether a real run
# would have been labelled synthetic too.
case "$EXPECT_SOLVER" in
  "")
    : ;;
  synthetic)
    [ "$SOLVER" = "false" ] ||
      fail "--expect-solver synthetic, but /health reports SU2 as available on this deployment"
    ;;
  su2)
    [ "$SOLVER" = "true" ] ||
      fail "--expect-solver su2, but /health reports SU2 is not available (SU2_CFD_BINARY unset or not answering)"
    ;;
  *)
    echo "smoke-deploy: unknown --expect-solver value: ${EXPECT_SOLVER}" >&2
    exit 2
    ;;
esac

# ── 2. The chain verifies ────────────────────────────────────────────────────
verify_status=$(curl -sS --max-time 30 -o /tmp/smoke-deploy-verify.$$ -w '%{http_code}' \
  "${AUTH_HEADER[@]}" "${BASE_URL}/api/v1/evidence/verify") || verify_status="000"
verification=$(cat /tmp/smoke-deploy-verify.$$ 2>/dev/null || true)
rm -f /tmp/smoke-deploy-verify.$$
if [ "$verify_status" != "200" ]; then
  # 401 is the common operator mistake here — AEROSCRIBE_API_KEY not exported —
  # so the message names it instead of saying "did not answer".
  fail "/api/v1/evidence/verify answered ${verify_status}${verification:+: ${verification}}"
fi
VALID=$(printf '%s' "$verification" | json valid)
if [ "$VALID" != "true" ]; then
  fail "the evidence chain does not verify: ${verification}"
fi
echo "  evidence chain valid ($(printf '%s' "$verification" | json records) records)"

# ── 3. A run reaches stage 8 ────────────────────────────────────────────────
# `solver: synthetic` is the honest choice for a smoke test: it needs no solver
# binary, and its label is what check 4 asserts.
run_body=$(node -e '
  const [topic] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({ topic, options: { solver: "synthetic", paperLimit: 3, verifyTop: 0 } }));
' "smoke test: transonic wing drag prediction $(date +%s)")

created=$(curl -fsS --max-time 30 "${AUTH_HEADER[@]}" -H 'content-type: application/json' \
  -X POST -d "$run_body" "${BASE_URL}/api/v1/runs") || fail "POST /api/v1/runs failed"
RUN_ID=$(printf '%s' "$created" | json run.id)
[ -n "$RUN_ID" ] || fail "the server did not return a run id: ${created}"
echo "  run ${RUN_ID}"

STAGE_COUNT=$(printf '%s' "$created" | json run.stages.length 9)
blocked_at=""
for step in $(seq 0 $((STAGE_COUNT - 1))); do
  advanced=$(curl -sS --max-time 120 "${AUTH_HEADER[@]}" -X POST \
    "${BASE_URL}/api/v1/runs/${RUN_ID}/advance") || fail "advance failed at step ${step}"

  stage_id=$(printf '%s' "$advanced" | json stage.id)
  [ -n "$stage_id" ] || fail "advance returned no stage at step ${step}: ${advanced}"

  status=$(curl -fsS --max-time 30 "${AUTH_HEADER[@]}" \
    "${BASE_URL}/api/v1/runs/${RUN_ID}" | json run.stages.${stage_id}.status)

  if [ "$status" = "failed" ]; then
    blocked_at="$stage_id"
    break
  fi
  [ "$status" = "gate_pending" ] || fail "stage ${stage_id} ended as '${status}' instead of gate_pending"

  gate=$(printf '%s' "$advanced" | json stage.gateId)
  [ -n "$gate" ] || fail "stage ${stage_id} is at a gate but named none"
  curl -fsS --max-time 30 "${AUTH_HEADER[@]}" -H 'content-type: application/json' \
    -X POST -d '{"actor":"smoke-deploy"}' \
    "${BASE_URL}/api/v1/runs/${RUN_ID}/gates/${gate}/approve" > /dev/null ||
    fail "approving ${gate} failed"
done

# ── 4. The honesty contract ─────────────────────────────────────────────────
final=$(curl -fsS --max-time 30 "${AUTH_HEADER[@]}" "${BASE_URL}/api/v1/runs/${RUN_ID}")
final_status=$(printf '%s' "$final" | json run.status)

if [ -z "$blocked_at" ]; then
  fail "the run completed all ${STAGE_COUNT} stages (status '${final_status}') — a synthetic run must be blocked at stage 8, and this deployment did not block it"
fi
if [ "$blocked_at" != "$((STAGE_COUNT - 1))" ]; then
  fail "the run was blocked at stage ${blocked_at}, not at stage $((STAGE_COUNT - 1))"
fi

# The blocker must name the synthetic solver. A generic "not ready" would let a
# deployment look correct while hiding that the number is not physics.
cfd=$(curl -fsS --max-time 30 "${AUTH_HEADER[@]}" \
  "${BASE_URL}/api/v1/runs/${RUN_ID}/evidence?kind=cfd-run")
CFD_SOLVER=$(printf '%s' "$cfd" | json records.0.payload.solver)
[ -n "$CFD_SOLVER" ] || fail "the run has no cfd-run record: ${cfd}"
if [ -n "$EXPECT_SOLVER" ] && [ "$CFD_SOLVER" != "$EXPECT_SOLVER" ]; then
  fail "the run's CFD record names solver '${CFD_SOLVER}', expected '${EXPECT_SOLVER}'"
fi
echo "  cfd solver recorded as '${CFD_SOLVER}'"

evidence=$(curl -fsS --max-time 30 "${AUTH_HEADER[@]}" \
  "${BASE_URL}/api/v1/runs/${RUN_ID}/evidence?kind=submission-package")
payload=$(printf '%s' "$evidence" | json records.0.payload)
case "$payload" in
  *synthetic*) : ;;
  *) fail "stage 8 was blocked, but the submission record does not name the synthetic solver: ${payload}" ;;
esac
echo "  stage 8 blocked and names the synthetic solver"

echo "smoke-deploy: PASS"
