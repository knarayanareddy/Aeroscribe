# Aeroscribe remediation plan

Proposed only. No test, solver, installation or deployment was run. Owner approval is required for credentials, research datasets and release actions.

## Phases and dependency map

| Phase | Entry | Exit |
|---|---|---|
| Baseline | Synthetic input and isolated dependencies | AS-T1 records real mode and available gates |
| Evidence correctness | AS-T1 and domain owner | AS-T2 verifies provenance and solver failure behavior |
| Security and supply chain | AS-T1 | AS-T3 verifies boundaries and immutable inputs |
| Automation and UX | AS-T2 and AS-T3 | AS-T4 exercises real workflows and visible modes |
| Deployment and recovery | AS-T4 and owner approvals | AS-T5 observes promotion and restore |

### Task dependency map

| Task | Depends on | Why it waits |
|---|---|---|
| AS-T1 | — | Establishes the baseline and confirms which gates exist before any claim of change. |
| AS-T2 | AS-T1 + qualified domain reviewer | Needs the baseline and a real scientific owner to validate provenance and solver behavior. |
| AS-T3 | AS-T1 | Uses the observed CI/deploy surface to verify trust boundaries and immutable inputs. |
| AS-T4 | AS-T2 + AS-T3 | Needs the scientific trace and the security baseline before UX and gate acceptance. |
| AS-T5 | AS-T4 + owner approval | Promotion and restore only make sense after the prior gates and explicit release authority. |

### Changes requiring owner approval

- Credentials used for API, SSH, registry, database, environment reviewers or secret rotation.
- Research datasets, solver inputs, evidence-store contents and any human-scoped scientific validation step.
- Release actions: staging-to-production promotion, digest selection, provenance/attestation acceptance and rollback authorization.
- Restore-drill authorization, including any production-adjacent data copy or integrity check.

### AS-T1 — Establish baseline (AS-1, AS-5)
Prerequisite: disposable workspace, synthetic inputs; observed root `package.json` and CI.
1. Record the exact revision, toolchain, current scripts and whether SU2 is available.
2. Run the existing test, typecheck and build scripts in isolation, preserving thresholds and capturing failures.
3. Trace fixture dashboard, live API and synthetic solver separately to their displayed output.
Deliverable: reproducible baseline with mode labels. Verification: a second reviewer repeats one synthetic end-to-end run and confirms it cannot be submitted.
- [ ] Historical results are distinguished from new observations.
- [ ] Fixture and live execution paths are identified separately.

### AS-T2 — Scientific trace and solver validation (AS-1)
Prerequisite: AS-T1 and qualified domain reviewer; observed `services/api/src/cfd/`, `services/api/src/store/` and `specs/` inventory.
1. Trace a representative claim from source inputs through solver, evidence registry and manuscript output.
2. Verify actual solver identity, convergence and unit assumptions against independent benchmark data; confirm unavailable or synthetic output blocks submission.
3. Preserve provenance and uncertainty in every output and require human research review.
Deliverable: independently reproducible scientific evidence and honest limits. Verification: alter a solver artifact or substitute synthetic data and ensure submission gate fails.
- [ ] A domain reviewer independently reproduces a real-solver example.
- [ ] Invalid, missing and synthetic evidence cannot silently pass.

### AS-T3 — Trust boundaries and reproducible dependencies (AS-3, AS-4)
Prerequisite: AS-T1; observed CI, deployment workflows and service inventory.
1. Trace API auth and authorization, input validation, literature URL handling, solver/LaTeX subprocess invocation and evidence storage access.
2. Pin reviewed Actions and container images, verify dependencies and scan built bundles with a synthetic secret canary.
3. Verify actual GitHub environment reviewer settings, least-privilege credentials, secret rotation and data retention.
Deliverable: security review and negative integration tests. Verification: unauthorized resource requests, hostile paths and canary leakage must be rejected or detected in isolated tests.
- [ ] Authentication and per-resource authorization are observed end-to-end.
- [ ] Artifact and dependency provenance is recorded.

### AS-T4 — Meaningful gates and interface acceptance (AS-1, preventive)
Prerequisites: AS-T2 and AS-T3; observed workflow and separate app manifests.
1. Exercise actual API, database, Redis and solver boundaries with reproducible fixtures alongside existing coverage gates.
2. Test landing, dashboard and video separately for mode labels, keyboard navigation, accessible status and error recovery.
3. Add independent tests for broken evidence linkage, missing provider and inaccessible solver, without lowering coverage thresholds.
Deliverable: behavioral and UX acceptance evidence. Verification: deliberately break an evidence gate and ensure its corresponding test fails.
- [ ] Tests detect deliberately broken behavior.
- [ ] Published fixture mode is unmistakable in observed UI.

### AS-T5 — Immutable deployment and recovery (AS-2, AS-3)
Prerequisite: AS-T4 and owner approval; observed staging and production workflows.
1. Make promotion require the exact staging-tested image digests and verify both API and dashboard identities.
2. Test production environment reviewer protection, TLS and staging smoke with authorized accounts.
3. Restore synthetic PostgreSQL and blob data to isolation, then rehearse release rollback and integrity checking.
Deliverable: observed promotion, restore and rollback record. Verification: compare running image digests and restored evidence hashes to approved artifacts.
- [ ] Promotion cannot silently substitute a mutable tag.
- [ ] Restore and independent release review are observed.

## Production acceptance and rollback

- [ ] Scientific reviewer, service owner and security owner accept explicit scope, provenance and evidence before release.
- [ ] Stop writes, redeploy the last verified staging digest, confirm the production host reports the same bytes, and only then reopen writes.
- [ ] If recovery needs data restore, use the last compatible backup in isolation first, verify evidence-chain integrity, and keep rollback available until the release owner signs off.
- [ ] A successful deployment proves only that the release artifacts ran; it does not imply scientific certification.

## Release and rollback policy

Observed surfaces: `release-api.yml` publishes API and dashboard images with provenance and SBOM, and `deploy-production.yml` accepts a tag with an optional digest, verifies the host bytes when a digest is provided, and surfaces previous release images for rollback.

Policy:

1. Release images only from `v*` tags on `main`.
2. Treat the staging-tested digest as the release identity when a digest exists; do not rely on a mutable tag alone for acceptance.
3. Require environment reviewer approval before production secrets are released to the job.
4. Verify the deployed host bytes after promotion and record the digest or tag used.
5. Roll back by redeploying the last verified image reference and preserving the prior host image list until the owner approves closure.

Rollback gate:

- The previous image record must be present.
- The restore or redeploy target must be compatible with the last verified evidence hash.
- Release owner approval is required before reopening writes.
