# Integrity rules

The rules below are copied verbatim from the project's design draft
([`archive/design-spec-v0.1.md`](archive/design-spec-v0.1.md), Article I and following
articles), with whitespace normalised. They are the project's stated definition of "not
fabricating results". Where a rule refers to packages or services that do not exist yet
(`packages/verified-registry`, `apps/api`, a Postgres-backed registry), the rule is a
requirement on the future backend, not a description of the current code.

## Enforcement status in this repository

| Rule                                                    | Status in this repository                                                                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RULE-001 (no fabricated numbers)                        | **Partly enforced.** The UI never computes research results; every displayed value comes from fixture data and is labelled "illustrative". A real backend is still required to enforce traceability.        |
| RULE-002 (DOI-verified citations)                       | **Not implemented.** The literature view ships fixture papers; no DOI resolution is performed.                                                                                                              |
| RULE-003 (no gate bypass)                               | **Enforced in the UI state machine.** `approveGate` only moves a stage that is `gate_pending`, and only in response to a human click (`packages/pipeline/src/reducer.ts`). The API endpoint does not exist. |
| RULE-004 (no AI authorship)                             | **Represented in the UI.** The manuscript view flags a missing AI-use disclosure; the rule is not mechanically enforced.                                                                                    |
| RULE-040 (no hardcoded secrets)                         | **Enforced by omission.** No credentials are collected or stored in the browser; the settings view is read-only and shows configuration as "Not configured".                                                |
| RULE-041 – RULE-044 (checksummed, append-only registry) | **Not implemented.** The dashboard renders fixture checksums to show the intended shape of the data.                                                                                                        |
| RULE-050 – RULE-063 (quality and process)               | **Partly adopted.** Strict TypeScript, lint, formatting, tests and PR checks exist; coverage thresholds and release process do not.                                                                         |

## Rules

> RULE-003 lists gate stages as "0, 3, 4a, 4b, 4c, 6, 7". That list contradicts the
> project's gate table (GATE-0 … GATE-8, with 4A/4B/4C) and the fixture data; see
> [`pipeline.md`](pipeline.md). The rule's substance — no gate may be auto-approved — stands.

**RULE-001.** NEVER fabricate, hallucinate, or invent any numerical result, experimental measurement, CFD output, or statistical metric. Every number in a manuscript must trace to a verified computation logged in packages/verified-registry/. Violation = immediate pipeline HALT.

**RULE-002.** NEVER add a reference to a manuscript that has not been DOI-resolved and metadata-verified by the LiteratureArchaeologyAgent. Citation hallucination is a pipeline-terminating offense.

**RULE-003.** NEVER bypass a HITL (Human-in-the-Loop) gate. Gates exist at Stages 0, 3, 4a, 4b, 4c, 6, and 7. No gate may be auto-approved by any agent. Human confirmation is required via the API endpoint POST /api/v1/pipeline/{run_id}/gate/{gate_id}/approve.

**RULE-004.** NEVER write code or specs that list an AI system as a paper author. AeroScribe is a tool. The human researcher is the author. The AI disclosure statement is ALWAYS generated and ALWAYS included.

**RULE-005.** NEVER submit a paper to a journal outside its declared scope. The JournalComplianceAgent MUST validate scope fit (score ≥ 7.0/10) before generating any submission package.

**RULE-010.** Always use strict TypeScript (tsconfig: strict: true) across all packages. No `any` types. No implicit returns. No unused variables. Python code: always type-annotated, mypy --strict passing.

**RULE-011.** All agents MUST be stateless between invocations. State is persisted exclusively to: - PostgreSQL (structured pipeline state) - Redis (ephemeral job queues) - S3/MinIO (binary artifacts: PDFs, CSVs, mesh files) - AeroWiki (markdown knowledge base) - VerifiedRegistry (computation provenance) DO NOT store state in memory, local files, or agent context windows.

**RULE-012.** All cross-package imports MUST go through the package's public index.ts barrel file. Never import from internal paths: ✅ import { LiteratureAgent } from '@aeroscribe/agents' ❌ import { LiteratureAgent } from '../../packages/agents/src/literature/base'

**RULE-013.** Every API endpoint MUST have: - Zod input validation schema - OpenAPI 3.1 documentation - Rate limiting (default: 60 req/min per API key) - Request/response logging to structured JSON

**RULE-014.** Every database query MUST go through the Drizzle ORM layer. Raw SQL is prohibited. No query may run without a corresponding migration file.

**RULE-015.** Cell boundaries are ENFORCED by Turborepo. The dependency graph is: shared → literature → agents → worker → api → web/cli No reverse dependencies. No circular imports. Ever.

**RULE-020.** The Scout Protocol is MANDATORY before any implementation task. Before writing new code, run: "Search /packages and /apps for existing utilities that serve this purpose. List them. Reuse them. DO NOT duplicate logic."

**RULE-021.** The Compression Loop runs AFTER every implementation: "Refactor the code just written to reduce line count by 15% without changing behavior or failing tests. Rely on @aeroscribe/shared utils."

**RULE-022.** Every agent invocation MUST be logged with: - agent_id, run_id, stage_id - input_token_count, output_token_count - duration_ms, model_used, cost_usd - tool_calls_made (array) Logged to: packages/shared/src/telemetry/

**RULE-023.** No agent may make more than 3 consecutive tool calls without a reasoning step. Tool-call chains > 3 without reasoning = automatic pipeline pause + researcher notification via OpenClaw.

**RULE-024.** Context window management — enforce AeroScribe budget rules: - Stage 1 (Literature): max 15 MCPs active, max 80 tools - Stage 4 (Evidence): max 8 MCPs active (CFD tools only) - Stage 5 (Writing): max 6 MCPs active (writing/LaTeX tools only) Never load all tools simultaneously. Context budget is sacred.

**RULE-025.** Subagents spawned by orchestrators MUST: - Start with fresh conversation (no parent history) - Load their stage-specific system prompt - Return structured JSON results only - Have max_spawn_depth: 3 (no deeper nesting)

**RULE-030.** All manuscript generation follows the hierarchical order: Level 1 (Paper Architecture) → Level 2 (Section Outlines) → Level 3 (Paragraph Plans) → Level 4 (Sentence Generation) → Level 5 (LaTeX Rendering) NEVER skip levels. NEVER write Level 4 before Level 3 is approved.

**RULE-031.** Every quantitative claim in a manuscript MUST follow the pattern: "[VALUE] ± [UNCERTAINTY] ([CONFIDENCE]%, [METHOD])" Example: "L/D = 18.4 ± 0.3 (95% CI, Richardson extrapolation)" Claims without uncertainty quantification are flagged as INCOMPLETE.

**RULE-032.** AIAA citation format is ENFORCED: Journal: [N] A. Author and B. Author, "Title," Journal Name, Vol. XX, No. Y, YYYY, pp. ZZZ–ZZZ. doi:10.XXXX/XXXXX Book: [N] A. Author, Book Title, Publisher, City, YYYY, pp. ZZZ–ZZZ. The CitationValidator runs on every bibliography entry before render.

**RULE-033.** Figure generation uses pgfplots ONLY (not matplotlib image exports). All figures are vector PDF. All figures include: - Axis labels with SI units - Legend (if multiple series) - Caption with data provenance reference - VerifiedRegistry SHA256 hash in LaTeX comment

**RULE-034.** The Abstract MUST follow the 4-sentence structure: S1: Problem statement + motivation (why this matters) S2: Approach (what method was used) S3: Key quantitative result (the main finding, with number) S4: Significance (broader impact/implication) Max 250 words. Written LAST, after all sections are complete.

**RULE-040.** API keys, credentials, and secrets MUST use environment variables ONLY. Never hardcode secrets. The PreToolUse hook blocks any write containing patterns: sk-, ghp_, AKIA, Bearer , password=, api_key= in non-.env files.

**RULE-041.** All CFD solver inputs and outputs are SHA256-checksummed and logged to VerifiedRegistry BEFORE any result is used in writing. The integrity chain: compute → checksum → registry → manuscript. Breaking this chain = pipeline HALT.

**RULE-042.** External API calls (Semantic Scholar, NTRS, arXiv) MUST implement exponential backoff retry: attempt 1: immediate attempt 2: wait 2s attempt 3: wait 4s attempt 4: wait 8s attempt 5: wait 16s → FAIL with structured error

**RULE-043.** The VerifiedRegistry is append-only. No record may be deleted or modified after creation. This is enforced at the database level with a trigger that rejects UPDATE/DELETE operations.

**RULE-044.** Every pipeline run generates a complete audit trail in packages/shared/src/audit/. Audit logs are immutable (S3 object lock).

**RULE-050.** Test coverage requirements: - packages/verified-registry: 100% (zero tolerance for uncovered paths) - packages/agents: ≥ 90% - packages/literature: ≥ 85% - packages/latex-engine: ≥ 85% - apps/api: ≥ 80% - apps/web: ≥ 70% CI blocks merge if coverage drops below these thresholds.

**RULE-051.** All async functions use async/await. No raw Promise chains. No unhandled promise rejections. All errors caught and logged.

**RULE-052.** If a computation exceeds its time budget (configurable per stage, default 15 minutes), it is KILLED and the pipeline records TIMEOUT in the VerifiedRegistry. Never let a runaway solve block the queue.

**RULE-053.** console.log is BANNED in production code. Use the structured logger: import { logger } from '@aeroscribe/shared'. All logs include run_id, stage_id, agent_id, and ISO timestamp.

**RULE-054.** No magic numbers in code. All constants go in packages/shared/src/constants/. Named, documented, typed.

**RULE-060.** Branch naming: feature/AERO-{ticket}-{slug}, fix/AERO-{ticket}-{slug}, spec/AERO-{ticket}-{slug} Example: feature/AERO-142-literature-reranker

**RULE-061.** Commit messages follow Conventional Commits: feat(stage-1): add Semantic Scholar citation graph expansion fix(latex-engine): correct AIAA bibliography format for conference papers spec(stage-4): add CFD evidence generation requirements

**RULE-062.** Every PR must include: - Spec reference: "Implements: specs/stage-X/tasks.md#TASK-XXX" - Test evidence: "Coverage: XX% (was YY%)" - Scout report: "Reused: [list of existing utilities]" - Compression report: "LOC: before=XXX, after=YYY (ZZ% reduction)"

**RULE-063.** Staging deploys happen automatically on PR merge to main. Production deploys require manual approval from Engineering Lead. Never auto-deploy to production. 📄 File 2: AGENTS.md — Multi-Agent Orchestration Rules Markdown
