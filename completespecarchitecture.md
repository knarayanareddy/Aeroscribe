🛠️ AeroScribe — Spec-Driven Development Architecture
Complete specification suite following the Altura model, adapted and extended for the AeroScribe autonomous aerospace research paper engine. Every file below is production-ready and can be dropped directly into your monorepo.

📁 Complete Monorepo Structure
text

aeroscribe/
│
├── CLAUDE.md                          ← Constitutional law for all AI agents
├── AGENTS.md                          ← Multi-agent orchestration rules
├── .cursorrules                       ← Cursor IDE rules (mirrors CLAUDE.md)
├── turbo.json                         ← Turborepo cell boundaries
├── package.json                       ← Root workspace manifest
│
├── specs/                             ← THE SPEC LAYER (source of truth)
│   ├── _global/
│   │   ├── architecture.md
│   │   ├── data-model.md
│   │   ├── api-contracts.md
│   │   ├── journal-profiles.md
│   │   └── agent-personas.md
│   │
│   ├── stage-0-topic-intelligence/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-1-literature-archaeology/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-2-novelty-detection/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-3-contribution-framing/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-4-evidence-generation/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-5-paper-synthesis/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-6-peer-review-council/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   ├── stage-7-revision-compliance/
│   │   ├── requirements.md
│   │   ├── data-model.md
│   │   ├── plan.md
│   │   └── tasks.md
│   │
│   └── stage-8-aerowiki/
│       ├── requirements.md
│       ├── data-model.md
│       ├── plan.md
│       └── tasks.md
│
├── apps/
│   ├── api/                           ← FastAPI backend
│   ├── web/                           ← Next.js researcher dashboard
│   ├── cli/                           ← Bun CLI for terminal access
│   └── worker/                        ← BullMQ job processor
│
├── packages/
│   ├── agents/                        ← All AI agent definitions
│   ├── literature/                    ← Literature archaeology engine
│   ├── latex-engine/                  ← AIAA LaTeX generation
│   ├── verified-registry/             ← SHA256 data provenance
│   ├── journal-profiles/              ← Journal targeting database
│   ├── aero-wiki/                     ← Compounding knowledge base
│   ├── review-council/                ← Internal peer review system
│   └── shared/                        ← Shared types, utils, constants
│
├── hooks/                             ← Claude Code PreToolUse/PostToolUse hooks
│   ├── pre-tool-use/
│   └── post-tool-use/
│
├── skills/                            ← Everything Claude Code skills
├── commands/                          ← Slash commands
└── infra/                             ← Terraform, Docker, K8s manifests
📄 File 1: CLAUDE.md — Constitutional Law
Markdown

# CLAUDE.md — AeroScribe Constitutional Law
# Version: 1.0.0
# Last Updated: 2026-04-26
# Authority: This file is the supreme law for ALL AI agents in this repository.
# No agent, skill, hook, or subagent may override these rules.

---

## ⚖️ ARTICLE I: ABSOLUTE PROHIBITIONS (NEVER VIOLATE)

:::STRICT_REQUIREMENT:::
RULE-001: NEVER fabricate, hallucinate, or invent any numerical result,
experimental measurement, CFD output, or statistical metric. Every number
in a manuscript must trace to a verified computation logged in
packages/verified-registry/. Violation = immediate pipeline HALT.
:::END:::

:::STRICT_REQUIREMENT:::
RULE-002: NEVER add a reference to a manuscript that has not been
DOI-resolved and metadata-verified by the LiteratureArchaeologyAgent.
Citation hallucination is a pipeline-terminating offense.
:::END:::

:::STRICT_REQUIREMENT:::
RULE-003: NEVER bypass a HITL (Human-in-the-Loop) gate. Gates exist at
Stages 0, 3, 4a, 4b, 4c, 6, and 7. No gate may be auto-approved by
any agent. Human confirmation is required via the API endpoint
POST /api/v1/pipeline/{run_id}/gate/{gate_id}/approve.
:::END:::

:::STRICT_REQUIREMENT:::
RULE-004: NEVER write code or specs that list an AI system as a paper
author. AeroScribe is a tool. The human researcher is the author.
The AI disclosure statement is ALWAYS generated and ALWAYS included.
:::END:::

:::STRICT_REQUIREMENT:::
RULE-005: NEVER submit a paper to a journal outside its declared scope.
The JournalComplianceAgent MUST validate scope fit (score ≥ 7.0/10)
before generating any submission package.
:::END:::

---

## 🏗️ ARTICLE II: ARCHITECTURE RULES

:::STRICT_REQUIREMENT:::
RULE-010: Always use strict TypeScript (tsconfig: strict: true) across
all packages. No `any` types. No implicit returns. No unused variables.
Python code: always type-annotated, mypy --strict passing.
:::END:::

RULE-011: All agents MUST be stateless between invocations. State is
persisted exclusively to:
  - PostgreSQL (structured pipeline state)
  - Redis (ephemeral job queues)
  - S3/MinIO (binary artifacts: PDFs, CSVs, mesh files)
  - AeroWiki (markdown knowledge base)
  - VerifiedRegistry (computation provenance)
  DO NOT store state in memory, local files, or agent context windows.

RULE-012: All cross-package imports MUST go through the package's
public index.ts barrel file. Never import from internal paths:
  ✅ import { LiteratureAgent } from '@aeroscribe/agents'
  ❌ import { LiteratureAgent } from '../../packages/agents/src/literature/base'

RULE-013: Every API endpoint MUST have:
  - Zod input validation schema
  - OpenAPI 3.1 documentation
  - Rate limiting (default: 60 req/min per API key)
  - Request/response logging to structured JSON

RULE-014: Every database query MUST go through the Drizzle ORM layer.
Raw SQL is prohibited. No query may run without a corresponding
migration file.

RULE-015: Cell boundaries are ENFORCED by Turborepo. The dependency
graph is:
  shared → literature → agents → worker → api → web/cli
  No reverse dependencies. No circular imports. Ever.

---

## 🤖 ARTICLE III: AI AGENT BEHAVIOR RULES

RULE-020: The Scout Protocol is MANDATORY before any implementation task.
Before writing new code, run:
  "Search /packages and /apps for existing utilities that serve this
   purpose. List them. Reuse them. DO NOT duplicate logic."

RULE-021: The Compression Loop runs AFTER every implementation:
  "Refactor the code just written to reduce line count by 15% without
   changing behavior or failing tests. Rely on @aeroscribe/shared utils."

RULE-022: Every agent invocation MUST be logged with:
  - agent_id, run_id, stage_id
  - input_token_count, output_token_count
  - duration_ms, model_used, cost_usd
  - tool_calls_made (array)
  Logged to: packages/shared/src/telemetry/

RULE-023: No agent may make more than 3 consecutive tool calls without
a reasoning step. Tool-call chains > 3 without reasoning = automatic
pipeline pause + researcher notification via OpenClaw.

RULE-024: Context window management — enforce AeroScribe budget rules:
  - Stage 1 (Literature): max 15 MCPs active, max 80 tools
  - Stage 4 (Evidence): max 8 MCPs active (CFD tools only)
  - Stage 5 (Writing): max 6 MCPs active (writing/LaTeX tools only)
  Never load all tools simultaneously. Context budget is sacred.

RULE-025: Subagents spawned by orchestrators MUST:
  - Start with fresh conversation (no parent history)
  - Load their stage-specific system prompt
  - Return structured JSON results only
  - Have max_spawn_depth: 3 (no deeper nesting)

---

## ✍️ ARTICLE IV: WRITING & MANUSCRIPT RULES

RULE-030: All manuscript generation follows the hierarchical order:
  Level 1 (Paper Architecture) → Level 2 (Section Outlines) →
  Level 3 (Paragraph Plans) → Level 4 (Sentence Generation) →
  Level 5 (LaTeX Rendering)
  NEVER skip levels. NEVER write Level 4 before Level 3 is approved.

RULE-031: Every quantitative claim in a manuscript MUST follow the pattern:
  "[VALUE] ± [UNCERTAINTY] ([CONFIDENCE]%, [METHOD])"
  Example: "L/D = 18.4 ± 0.3 (95% CI, Richardson extrapolation)"
  Claims without uncertainty quantification are flagged as INCOMPLETE.

RULE-032: AIAA citation format is ENFORCED:
  Journal: [N] A. Author and B. Author, "Title," Journal Name,
           Vol. XX, No. Y, YYYY, pp. ZZZ–ZZZ. doi:10.XXXX/XXXXX
  Book:    [N] A. Author, Book Title, Publisher, City, YYYY, pp. ZZZ–ZZZ.
  The CitationValidator runs on every bibliography entry before render.

RULE-033: Figure generation uses pgfplots ONLY (not matplotlib image exports).
  All figures are vector PDF. All figures include:
  - Axis labels with SI units
  - Legend (if multiple series)
  - Caption with data provenance reference
  - VerifiedRegistry SHA256 hash in LaTeX comment

RULE-034: The Abstract MUST follow the 4-sentence structure:
  S1: Problem statement + motivation (why this matters)
  S2: Approach (what method was used)
  S3: Key quantitative result (the main finding, with number)
  S4: Significance (broader impact/implication)
  Max 250 words. Written LAST, after all sections are complete.

---

## 🛡️ ARTICLE V: SECURITY & INTEGRITY RULES

RULE-040: API keys, credentials, and secrets MUST use environment
variables ONLY. Never hardcode secrets. The PreToolUse hook
blocks any write containing patterns: sk-, ghp_, AKIA, Bearer ,
password=, api_key= in non-.env files.

RULE-041: All CFD solver inputs and outputs are SHA256-checksummed
and logged to VerifiedRegistry BEFORE any result is used in writing.
The integrity chain: compute → checksum → registry → manuscript.
Breaking this chain = pipeline HALT.

RULE-042: External API calls (Semantic Scholar, NTRS, arXiv) MUST
implement exponential backoff retry:
  attempt 1: immediate
  attempt 2: wait 2s
  attempt 3: wait 4s
  attempt 4: wait 8s
  attempt 5: wait 16s → FAIL with structured error

RULE-043: The VerifiedRegistry is append-only. No record may be
deleted or modified after creation. This is enforced at the
database level with a trigger that rejects UPDATE/DELETE operations.

RULE-044: Every pipeline run generates a complete audit trail in
packages/shared/src/audit/. Audit logs are immutable (S3 object lock).

---

## 📐 ARTICLE VI: CODE QUALITY RULES

RULE-050: Test coverage requirements:
  - packages/verified-registry: 100% (zero tolerance for uncovered paths)
  - packages/agents: ≥ 90%
  - packages/literature: ≥ 85%
  - packages/latex-engine: ≥ 85%
  - apps/api: ≥ 80%
  - apps/web: ≥ 70%
  CI blocks merge if coverage drops below these thresholds.

RULE-051: All async functions use async/await. No raw Promise chains.
No unhandled promise rejections. All errors caught and logged.

RULE-052: If a computation exceeds its time budget (configurable per
stage, default 15 minutes), it is KILLED and the pipeline records
TIMEOUT in the VerifiedRegistry. Never let a runaway solve block the queue.

RULE-053: console.log is BANNED in production code. Use the structured
logger: import { logger } from '@aeroscribe/shared'. All logs include
run_id, stage_id, agent_id, and ISO timestamp.

RULE-054: No magic numbers in code. All constants go in
packages/shared/src/constants/. Named, documented, typed.

---

## 🔄 ARTICLE VII: GIT & DEPLOYMENT RULES

RULE-060: Branch naming: feature/AERO-{ticket}-{slug},
  fix/AERO-{ticket}-{slug}, spec/AERO-{ticket}-{slug}
  Example: feature/AERO-142-literature-reranker

RULE-061: Commit messages follow Conventional Commits:
  feat(stage-1): add Semantic Scholar citation graph expansion
  fix(latex-engine): correct AIAA bibliography format for conference papers
  spec(stage-4): add CFD evidence generation requirements

RULE-062: Every PR must include:
  - Spec reference: "Implements: specs/stage-X/tasks.md#TASK-XXX"
  - Test evidence: "Coverage: XX% (was YY%)"
  - Scout report: "Reused: [list of existing utilities]"
  - Compression report: "LOC: before=XXX, after=YYY (ZZ% reduction)"

RULE-063: Staging deploys happen automatically on PR merge to main.
Production deploys require manual approval from Engineering Lead.
Never auto-deploy to production.
📄 File 2: AGENTS.md — Multi-Agent Orchestration Rules
Markdown

# AGENTS.md — AeroScribe Multi-Agent Orchestration Constitution
# Version: 1.0.0
# This file defines how ALL agents in AeroScribe interact,
# spawn, communicate, and terminate.

---

## 🧠 AGENT REGISTRY

### Orchestrator Agents (max_spawn_depth: 0)
These agents coordinate but do not implement. They spawn workers.

| Agent ID              | Role                          | Max Workers | Timeout  |
|-----------------------|-------------------------------|-------------|----------|
| PipelineOrchestrator  | Top-level pipeline controller | 8           | 72 hours |
| StageOrchestrator     | Per-stage coordinator         | 5           | 12 hours |
| ReviewCouncilChair    | Internal peer review director | 5           | 4 hours  |

### Worker Agents (max_spawn_depth: 1 from orchestrators)
These agents do the actual work. They may spawn analysis subagents.

| Agent ID                    | Stage | Primary Tool           | Max Runtime |
|-----------------------------|-------|------------------------|-------------|
| TopicIntelligenceAgent      | 0     | journal_profile_db     | 15 min      |
| LiteratureHarvestAgent      | 1     | semantic_scholar_api   | 4 hours     |
| CitationGraphAgent          | 1     | gitnexus_indexer       | 2 hours     |
| LiteratureRerankerAgent     | 1     | llm_reranker           | 1 hour      |
| NoveltyDetectionAgent       | 2     | gap_matrix_builder     | 1 hour      |
| ContributionFramingAgent    | 3     | contribution_generator | 30 min      |
| CFDSetupAgent               | 4     | cfd_mesh_generator     | 30 min      |
| CFDSolverAgent              | 4     | cfd_solver_runner      | 15 min/run  |
| CFDPostProcessor            | 4     | result_extractor       | 15 min      |
| StatisticalValidationAgent  | 4     | stats_validator        | 30 min      |
| ArchitectureAgent           | 5     | paper_architect        | 30 min      |
| SectionWriterAgent          | 5     | hierarchical_writer    | 2 hours     |
| LaTeXRenderAgent            | 5     | latex_compiler         | 30 min      |
| ReviewerAAgent              | 6     | methodology_reviewer   | 1 hour      |
| ReviewerBAgent              | 6     | literature_reviewer    | 1 hour      |
| ReviewerCAgent              | 6     | physics_reviewer       | 1 hour      |
| ReviewerDAgent              | 6     | compliance_reviewer    | 1 hour      |
| MetaReviewerAgent           | 6     | meta_review_synthesizer| 30 min      |
| RevisionAgent               | 7     | revision_writer        | 2 hours     |
| ComplianceAgent             | 7     | journal_compliance     | 30 min      |
| WikiCompilerAgent           | 8     | wiki_builder           | 1 hour      |
| SynthesisAgent              | 8     | cross_paper_synthesizer| 2 hours     |

---

## 📨 INTER-AGENT COMMUNICATION PROTOCOL

All inter-agent messages MUST follow this schema:

```typescript
interface AgentMessage {
  message_id: string;          // UUID v4
  run_id: string;              // Pipeline run identifier
  stage_id: StageId;           // "stage-0" through "stage-8"
  from_agent: AgentId;
  to_agent: AgentId | "orchestrator" | "researcher";
  message_type: AgentMessageType;
  payload: Record<string, unknown>;
  requires_response: boolean;
  timeout_ms: number;
  created_at: string;          // ISO 8601
}

type AgentMessageType =
  | "TASK_ASSIGNMENT"
  | "TASK_RESULT"
  | "TASK_FAILED"
  | "GATE_REQUEST"             // Request for HITL approval
  | "GATE_APPROVED"
  | "GATE_REJECTED"
  | "PIPELINE_HALT"            // Emergency stop
  | "PIPELINE_PAUSE"
  | "CONTEXT_UPDATE"           // New info for downstream agents
  | "WIKI_UPDATE";             // New article for AeroWiki
🔒 AGENT ISOLATION RULES
Subagents start with ZERO parent context. They receive only:

Their stage-specific system prompt (from specs/stage-X/requirements.md)
Their specific task payload (structured JSON)
Read-only access to AeroWiki (never write access from subagents)
Read-only access to VerifiedRegistry
Only Orchestrators may WRITE to:

Pipeline state (PostgreSQL)
VerifiedRegistry (append-only)
AeroWiki (via WikiCompilerAgent only)
Worker agents communicate UP (to orchestrator) or SIDEWAYS (to peer workers in the same stage). Never DOWN (to spawn their own workers without orchestrator permission).

Cross-stage communication is PROHIBITED during execution. Stage N+1 starts only when Stage N produces a STAGE_COMPLETE event.

🚦 GATE PROTOCOL
Each HITL gate follows this exact sequence:

text

Agent → GATE_REQUEST → PipelineOrchestrator
     → notify researcher (OpenClaw: Slack + Email + Voice summary)
     → wait for POST /api/v1/pipeline/{run_id}/gate/{gate_id}/approve
     → if approved: GATE_APPROVED → resume pipeline
     → if rejected: GATE_REJECTED → RevisionAgent activated
     → if timeout (48 hours): PIPELINE_PAUSE + researcher re-notification
Gate IDs and their trigger conditions:

Gate ID	Stage	Trigger	Blocking
GATE-0	0	Journal ranking + topic confirmed	Yes
GATE-1	1	Reading list delivered (95+ papers)	Yes
GATE-2	2	Novelty certificate generated	Yes
GATE-3	3	Contribution statement locked	Yes
GATE-4A	4	Grid convergence study complete	Yes
GATE-4B	4	Validation vs. experiment complete	Yes
GATE-4C	4	Final figure set approved	Yes
GATE-5	5	Section outlines approved	Yes
GATE-6	6	Review council report delivered	Yes
GATE-7	7	Response-to-reviewers approved	Yes
GATE-8	8	Submission package final approval	Yes
text


---

## 📄 File 3: `specs/_global/architecture.md`

```markdown
# AeroScribe — Global System Architecture Specification
# Spec ID: GLOBAL-ARCH-001
# Status: APPROVED
# Last Updated: 2026-04-26

---

## 1. SYSTEM OVERVIEW

AeroScribe is an autonomous aerospace research paper engine. It takes a
research topic as input and produces a submission-ready manuscript
calibrated to a target aerospace journal as output.

It is NOT a general-purpose writing assistant. It is NOT a chatbot.
It is a structured, multi-stage pipeline with mandatory human oversight
gates, verified computational evidence generation, and compounding
institutional memory.

## 2. TECHNOLOGY STACK

### Backend (apps/api)
- Runtime: Bun 1.1+
- Framework: Hono (lightweight, edge-compatible)
- Language: TypeScript 5.4+ (strict mode)
- ORM: Drizzle ORM
- Database: PostgreSQL 16 (primary state)
- Cache/Queue: Redis 7 + BullMQ
- Object Storage: MinIO (self-hosted S3-compatible)
- Auth: Clerk (JWT-based, researcher identity)

### Frontend (apps/web)
- Framework: Next.js 15 (App Router)
- Language: TypeScript 5.4+
- UI: shadcn/ui + Tailwind CSS 4
- State: Zustand + TanStack Query
- Real-time: Server-Sent Events (pipeline progress)
- Charts: Recharts (pipeline metrics), D3 (citation graph)

### CLI (apps/cli)
- Runtime: Bun
- UI: Ink (React for terminal)
- Purpose: Power-user terminal access, CI/CD integration

### Worker (apps/worker)
- Runtime: Bun
- Queue: BullMQ (Redis-backed)
- Concurrency: Up to 8 parallel stage workers
- Purpose: All async agent job execution

### AI Layer (packages/agents)
- Primary Model: Claude claude-sonnet-4-5 (orchestration)
- Fast Model: Claude Haiku 3.5 (literature filtering, formatting)
- Research Model: Claude Opus 4 (novelty detection, review council)
- CFD Integration: SU2 7.x, OpenFOAM 12, Eilmer4
- Literature APIs: Semantic Scholar, NTRS, arXiv, Crossref

### Infrastructure
- Container: Docker + Docker Compose (development)
- Orchestration: Kubernetes (production)
- IaC: Terraform (AWS/GCP/Azure agnostic)
- CI/CD: GitHub Actions
- Monitoring: OpenTelemetry → Grafana + Prometheus

## 3. DATA FLOW ARCHITECTURE
Researcher Input (Topic + Journal + Constraints) │ ▼ ┌─────────────────────────────────────────────────────────┐ │ Pipeline Orchestrator │ │ (PipelineOrchestrator) │ │ State: PostgreSQL │ └──────────────────────┬──────────────────────────────────┘ │ ┌──────────────┼──────────────┐ ▼ ▼ ▼ BullMQ Queue Redis Cache S3/MinIO (job dispatch) (agent state) (artifacts) │ ▼ ┌──────────────────────────────────┐ │ Stage Workers │ │ ┌─────────────────────────┐ │ │ │ Stage N Orchestrator │ │ │ │ ├── Worker Agent 1 │ │ │ │ ├── Worker Agent 2 │ │ │ │ └── Worker Agent N │ │ │ └─────────────────────────┘ │ └──────────────┬───────────────────┘ │ ┌──────────┼──────────┐ ▼ ▼ ▼ PostgreSQL AeroWiki VerifiedRegistry (pipeline) (markdown) (SHA256 chain)

text


## 4. CELL BOUNDARIES (Turborepo Enforcement)
Cell: SHARED packages/shared (types, utils, constants, logger, telemetry) ↑ consumed by all cells, depends on nothing internal

Cell: DATA packages/verified-registry packages/aero-wiki packages/journal-profiles → depends on: SHARED only

Cell: INTELLIGENCE packages/literature packages/agents packages/review-council → depends on: SHARED, DATA

Cell: ENGINE packages/latex-engine → depends on: SHARED, DATA, INTELLIGENCE

Cell: APPLICATIONS apps/api apps/worker → depends on: all cells

Cell: INTERFACES apps/web apps/cli → depends on: SHARED (types only, via API calls)

text


## 5. PIPELINE STATE MACHINE
States: IDLE → STAGE_0 → ... → STAGE_8 → COMPLETE ↘ FAILED ↘ PAUSED (awaiting HITL) ↘ HALTED (integrity violation)

Transitions: IDLE → STAGE_0: researcher submits topic STAGE_N → GATE_N: stage produces output GATE_N (approved) → STAGE_N+1: researcher approves GATE_N (rejected) → STAGE_N (revision): researcher rejects ANY → HALTED: integrity violation detected ANY → FAILED: unrecoverable error after 3 retries STAGE_8 → COMPLETE: wiki compiled, submission package ready

text


## 6. ENVIRONMENT VARIABLES (Required)

```bash
# AI Models
ANTHROPIC_API_KEY=           # Required
ANTHROPIC_MODEL_ORCHESTRATOR=claude-opus-4-5
ANTHROPIC_MODEL_WORKER=claude-sonnet-4-5
ANTHROPIC_MODEL_FAST=claude-haiku-3-5

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Storage
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET_AEROSCRIBE=aeroscribe-artifacts

# Literature APIs
SEMANTIC_SCHOLAR_API_KEY=    # Required
CROSSREF_POLITE_EMAIL=       # Required (Crossref polite pool)
ARXIV_API_BASE=https://export.arxiv.org/api/query
NASA_NTRS_API_BASE=https://ntrs.nasa.gov/api

# CFD Solvers
SU2_BINARY_PATH=/usr/local/bin/SU2_CFD
OPENFOAM_PATH=/opt/openfoam12
EILMER4_PATH=/usr/local/bin/e4shared
CFD_SCRATCH_DIR=/scratch/aeroscribe/cfd
CFD_MAX_WALL_TIME_MINUTES=15
CFD_MAX_CORES=8

# Auth
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=

# Notifications (OpenClaw)
OPENCLAW_WEBHOOK_URL=
SLACK_WEBHOOK_URL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Integrity
VERIFIED_REGISTRY_HMAC_SECRET=  # For append-only enforcement
text


---

## 📄 File 4: `specs/_global/data-model.md`

```markdown
# AeroScribe — Global Data Model Specification
# Spec ID: GLOBAL-DM-001
# Status: APPROVED

---

## CORE ENTITIES

### PipelineRun
```typescript
interface PipelineRun {
  id: string;                        // UUID v4, primary key
  researcher_id: string;             // Clerk user ID
  topic_seed: string;                // Raw input from researcher
  target_journal: JournalId;         // Enum: see journal-profiles.md
  paper_type: PaperType;             // "research_article" | "technical_note" | "survey" | "design_forum"
  status: PipelineStatus;
  current_stage: StageId;
  created_at: string;                // ISO 8601
  updated_at: string;
  completed_at: string | null;
  total_cost_usd: number;            // Accumulated API costs
  total_tokens_used: number;
  audit_log_s3_key: string;          // Immutable S3 audit trail
}

type PipelineStatus =
  | "idle"
  | "stage_0" | "stage_1" | "stage_2" | "stage_3"
  | "stage_4" | "stage_5" | "stage_6" | "stage_7" | "stage_8"
  | "gate_pending"                   // Awaiting HITL
  | "paused"                         // Researcher paused
  | "complete"
  | "failed"
  | "halted";                        // Integrity violation
Paper
TypeScript

interface Paper {
  id: string;
  run_id: string;                    // FK: PipelineRun
  title: string | null;              // Set in Stage 5
  abstract: string | null;           // Set last in Stage 5
  target_journal: JournalId;
  paper_type: PaperType;
  word_count: number | null;
  latex_s3_key: string | null;       // S3 path to .tex file
  pdf_s3_key: string | null;         // S3 path to compiled PDF
  submission_package_s3_key: string | null;
  sections: PaperSection[];
  status: PaperStatus;
  version: number;                   // Increments on each revision
  novelty_score: number | null;      // 0–10 from Stage 2
  created_at: string;
  updated_at: string;
}

interface PaperSection {
  id: string;
  paper_id: string;
  section_type: SectionType;
  title: string;
  content_latex: string | null;
  word_count: number | null;
  status: "draft" | "reviewed" | "approved";
  order_index: number;
}

type SectionType =
  | "abstract" | "nomenclature" | "introduction"
  | "methodology" | "results" | "discussion"
  | "conclusions" | "acknowledgments" | "references"
  | "appendix";
LiteratureReference
TypeScript

interface LiteratureReference {
  id: string;
  run_id: string;
  doi: string | null;
  arxiv_id: string | null;
  title: string;
  authors: string[];                 // ["Last, F.", "Last, F."]
  journal_name: string | null;
  conference_name: string | null;
  year: number;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  url: string | null;
  abstract: string | null;
  citation_count: number;
  impact_factor: number | null;
  relevance_score: number;           // 0–10, from reranker
  tier: LiteratureTier;
  key_finding: string | null;        // LLM-extracted summary
  methodology_used: string | null;   // LLM-extracted
  gap_identified: string | null;     // LLM-extracted
  aiaa_citation_string: string;      // Pre-formatted AIAA numeric
  doi_verified: boolean;             // Must be true before use in manuscript
  metadata_verified: boolean;
  created_at: string;
}

type LiteratureTier =
  | "tier_1_core"       // Must cite
  | "tier_2_supporting" // Should cite
  | "tier_3_background" // May cite
  | "tier_4_contrasting"; // Cite to contrast
VerifiedResult
TypeScript

interface VerifiedResult {
  id: string;                        // UUID v4
  run_id: string;
  stage_id: StageId;
  result_type: VerifiedResultType;
  description: string;               // Human-readable description
  value: number | string | object;   // The actual result
  unit: string | null;               // SI unit string
  uncertainty: number | null;        // ±value
  confidence_level: number | null;   // 0.95 for 95% CI
  source_file_s3_key: string;        // Raw output file in S3
  source_file_sha256: string;        // INTEGRITY: immutable after set
  computation_config: object;        // Full solver configuration
  solver_used: SolverType | null;
  wall_time_seconds: number;
  created_at: string;                // Append-only: no updates/deletes
}

type VerifiedResultType =
  | "cfd_lift_drag"
  | "cfd_pressure_distribution"
  | "cfd_skin_friction"
  | "cfd_thrust"
  | "cfd_isp"
  | "cfd_efficiency"
  | "statistical_validation"
  | "grid_convergence"
  | "literature_metric";

type SolverType = "su2" | "openfoam" | "eilmer4" | "pycycle" | "calculix";
ReviewReport
TypeScript

interface ReviewReport {
  id: string;
  run_id: string;
  paper_id: string;
  reviewer_persona: ReviewerPersona;
  recommendation: ReviewRecommendation;
  confidence: "high" | "medium" | "low";
  summary: string;
  major_concerns: ReviewConcern[];
  minor_concerns: ReviewConcern[];
  specific_questions: string[];
  positive_aspects: string[];
  format_violations: FormatViolation[];
  created_at: string;
}

interface ReviewConcern {
  id: string;
  description: string;
  location_in_paper: string;         // "Section III.B, Equation 7"
  suggested_resolution: string;
  severity: "major" | "minor";
  addressed: boolean;                // Updated during Stage 7
  resolution_location: string | null;// Where in revised paper
}

type ReviewerPersona =
  | "methodology_purist"
  | "literature_expert"
  | "physical_reasoner"
  | "associate_editor"
  | "meta_reviewer";

type ReviewRecommendation =
  | "accept"
  | "minor_revision"
  | "major_revision"
  | "reject";
AeroWikiArticle
TypeScript

interface AeroWikiArticle {
  id: string;
  path: string;                      // "propulsion/rde-turbulence-modeling.md"
  title: string;
  content_markdown: string;
  run_ids_contributing: string[];    // Which pipeline runs contributed
  tags: string[];                    // For cross-linking
  related_article_paths: string[];   // Auto-discovered links
  version: number;
  created_at: string;
  updated_at: string;
  created_by_agent: AgentId;
}
HITLGate
TypeScript

interface HITLGate {
  id: string;
  run_id: string;
  gate_id: GateId;
  stage_id: StageId;
  status: "pending" | "approved" | "rejected" | "timeout";
  payload: object;                   // What the researcher sees
  researcher_decision: "approve" | "reject" | null;
  researcher_comment: string | null;
  notified_at: string;
  decided_at: string | null;
  timeout_at: string;                // 48 hours after notified_at
}
DATABASE SCHEMA (Drizzle ORM)
TypeScript

// packages/shared/src/db/schema.ts

import { pgTable, uuid, text, integer, real, boolean,
         jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const pipelineStatusEnum = pgEnum('pipeline_status', [
  'idle', 'stage_0', 'stage_1', 'stage_2', 'stage_3',
  'stage_4', 'stage_5', 'stage_6', 'stage_7', 'stage_8',
  'gate_pending', 'paused', 'complete', 'failed', 'halted'
]);

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  researcher_id: text('researcher_id').notNull(),
  topic_seed: text('topic_seed').notNull(),
  target_journal: text('target_journal').notNull(),
  paper_type: text('paper_type').notNull(),
  status: pipelineStatusEnum('status').notNull().default('idle'),
  current_stage: text('current_stage').notNull().default('stage_0'),
  total_cost_usd: real('total_cost_usd').notNull().default(0),
  total_tokens_used: integer('total_tokens_used').notNull().default(0),
  audit_log_s3_key: text('audit_log_s3_key'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  completed_at: timestamp('completed_at'),
});

export const verifiedResults = pgTable('verified_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  run_id: uuid('run_id').notNull().references(() => pipelineRuns.id),
  stage_id: text('stage_id').notNull(),
  result_type: text('result_type').notNull(),
  description: text('description').notNull(),
  value: jsonb('value').notNull(),
  unit: text('unit'),
  uncertainty: real('uncertainty'),
  confidence_level: real('confidence_level'),
  source_file_s3_key: text('source_file_s3_key').notNull(),
  source_file_sha256: text('source_file_sha256').notNull(),
  computation_config: jsonb('computation_config').notNull(),
  solver_used: text('solver_used'),
  wall_time_seconds: integer('wall_time_seconds').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
  // NO updated_at — append-only enforced by DB trigger
});

// Append-only trigger (migration):
// CREATE OR REPLACE RULE no_update_verified_results AS
//   ON UPDATE TO verified_results DO INSTEAD NOTHING;
// CREATE OR REPLACE RULE no_delete_verified_results AS
//   ON DELETE TO verified_results DO INSTEAD NOTHING;
text


---

## 📄 File 5: `specs/_global/api-contracts.md`

```markdown
# AeroScribe — API Contract Specification
# Spec ID: GLOBAL-API-001
# Status: APPROVED
# Base URL: /api/v1

---

## AUTHENTICATION
All endpoints require: Authorization: Bearer {clerk_jwt_token}
Rate limit: 60 requests/minute per researcher

---

## PIPELINE ENDPOINTS

### POST /pipeline/runs
Create and start a new pipeline run.

Input:
```json
{
  "topic_seed": "string (10–500 chars, required)",
  "target_journal": "JournalId (required)",
  "paper_type": "PaperType (required)",
  "constraints": {
    "max_word_count": "integer (optional, default: 10000)",
    "exclude_topics": "string[] (optional)",
    "require_experimental_validation": "boolean (optional)",
    "cfd_solver": "SolverType (optional, default: su2)"
  }
}
Output (201):

JSON

{
  "run_id": "uuid",
  "status": "stage_0",
  "estimated_completion_hours": "number",
  "dashboard_url": "string",
  "created_at": "ISO8601"
}
Errors:

400: Invalid journal ID, topic too short/long
402: Insufficient API credits
429: Rate limit exceeded
GET /pipeline/runs/{run_id}
Get full pipeline run status.

Output (200):

JSON

{
  "run_id": "uuid",
  "status": "PipelineStatus",
  "current_stage": "StageId",
  "stages_complete": "StageId[]",
  "current_gate": "GateId | null",
  "progress_pct": "number (0–100)",
  "total_cost_usd": "number",
  "estimated_remaining_hours": "number",
  "paper_id": "uuid | null",
  "alerts": "AgentAlert[]"
}
POST /pipeline/runs/{run_id}/gates/{gate_id}/approve
Approve a HITL gate.

Input:

JSON

{
  "decision": "approve | reject",
  "comment": "string (optional, max 2000 chars)",
  "revision_instructions": "string (optional, only if decision=reject)"
}
Output (200):

JSON

{
  "gate_id": "GateId",
  "decision": "approve | reject",
  "pipeline_status": "PipelineStatus",
  "next_stage": "StageId | null"
}
GET /pipeline/runs/{run_id}/stream
SSE stream of pipeline events (for dashboard real-time updates).

Event types:

text

data: {"type": "STAGE_PROGRESS", "stage": "stage_1", "pct": 42, "message": "Harvesting arXiv..."}
data: {"type": "AGENT_LOG", "agent": "LiteratureHarvestAgent", "message": "Found 847 candidates"}
data: {"type": "GATE_READY", "gate_id": "GATE-1", "action_required": true}
data: {"type": "PIPELINE_HALT", "reason": "Integrity violation in VerifiedRegistry"}
data: {"type": "STAGE_COMPLETE", "stage": "stage_1", "duration_ms": 7200000}
LITERATURE ENDPOINTS
GET /pipeline/runs/{run_id}/literature
Get the reading list for a run.

Output (200):

JSON

{
  "run_id": "uuid",
  "total_count": "integer",
  "tiers": {
    "tier_1_core": "LiteratureReference[]",
    "tier_2_supporting": "LiteratureReference[]",
    "tier_3_background": "LiteratureReference[]",
    "tier_4_contrasting": "LiteratureReference[]"
  },
  "citation_graph_url": "string (S3 presigned URL to graph JSON)",
  "landscape_summary_markdown": "string"
}
PAPER ENDPOINTS
GET /pipeline/runs/{run_id}/paper
Get the current manuscript state.

Output (200):

JSON

{
  "paper_id": "uuid",
  "title": "string | null",
  "status": "PaperStatus",
  "version": "integer",
  "word_count": "integer | null",
  "sections": "PaperSection[]",
  "latex_download_url": "string | null",
  "pdf_download_url": "string | null",
  "novelty_score": "number | null",
  "compliance_checklist": "ComplianceItem[]"
}
REVIEW COUNCIL ENDPOINTS
GET /pipeline/runs/{run_id}/reviews
Get all review council reports.

Output (200):

JSON

{
  "reviews": "ReviewReport[]",
  "meta_review": "ReviewReport | null",
  "overall_recommendation": "ReviewRecommendation",
  "total_major_concerns": "integer",
  "total_minor_concerns": "integer",
  "estimated_revision_effort": "low | medium | high"
}
VERIFIED REGISTRY ENDPOINTS
GET /pipeline/runs/{run_id}/registry
Get all verified computation results.

Output (200):

JSON

{
  "results": "VerifiedResult[]",
  "integrity_status": "verified | compromised",
  "chain_hash": "string (SHA256 of all records concatenated)"
}
GET /pipeline/runs/{run_id}/registry/{result_id}/download
Download raw computation output file (S3 presigned URL, 1 hour expiry).

text


---

## 📄 File 6: `specs/stage-0-topic-intelligence/requirements.md`

```markdown
# Stage 0: Topic Intelligence & Journal Targeting
# Spec ID: STAGE-0-REQ-001
# Status: APPROVED
# Implementing: TopicIntelligenceAgent
# Max Duration: 15 minutes
# Gate: GATE-0 (researcher must approve journal selection)

---

## BUSINESS CONTEXT

The researcher has a vague or specific topic in mind. They may know
exactly which journal they want, or they may need guidance. Stage 0
transforms a raw topic seed into a precise, actionable research target:
correct journal, correct paper type, scoped keyword set, and a LaTeX
skeleton ready for population.

This stage sets the invariants for all downstream stages. A wrong
journal selection here wastes 60 hours of pipeline work. Therefore,
GATE-0 is mandatory and blocking.

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-0-001: TopicIntelligenceAgent MUST query the JournalProfileDB
(packages/journal-profiles/) for ALL aerospace journals and compute
a fit score (0–10) for the input topic against each journal's scope.
Input: topic_seed (string)
Output: JournalRankingMatrix (array of {journal_id, fit_score, scope_overlap_pct, estimated_acceptance_probability, rationale})
Minimum journals evaluated: 12
:::END:::

:::STRICT_REQUIREMENT:::
FR-0-002: The agent MUST classify the paper type from topic_seed:
  - "research_article": new methodology or result, 8000–12000 words
  - "technical_note": limited scope new data, 2500–3500 words
  - "survey": comprehensive literature review, 12000–20000 words
  - "design_forum": design methodology, 5000–8000 words
Output must include: paper_type, word_count_target, rationale
:::END:::

:::STRICT_REQUIREMENT:::
FR-0-003: The agent MUST generate a KeywordCloud of ≥ 40 candidate
keywords, organized into:
  - primary_keywords (5–8): core subject terms
  - secondary_keywords (10–15): methodology and approach terms
  - database_keywords (20+): database-specific search strings
    (Semantic Scholar, NTRS, arXiv format variants)
:::END:::

:::STRICT_REQUIREMENT:::
FR-0-004: The agent MUST generate a LaTeX skeleton for the target
journal using the template from packages/latex-engine/templates/.
The skeleton MUST include:
  - Correct document class and package imports for target journal
  - All required sections (journal-specific)
  - Nomenclature environment
  - Bibliography style file reference
  - AI disclosure statement placeholder
  - VerifiedRegistry integration comments
:::END:::

FR-0-005: The agent SHOULD identify 3–5 competing/related research
groups that are active in this space (author names, institutions, recent
papers), to inform later novelty positioning.

FR-0-006: If topic_seed contains insufficient detail (< 30 words or
is ambiguous), the agent MUST ask clarifying questions via the
GATE-0 payload before proceeding. Do not guess scope.

---

## NON-FUNCTIONAL REQUIREMENTS

NFR-0-001: Total stage duration MUST NOT exceed 15 minutes wall time.
NFR-0-002: JournalProfileDB lookup is synchronous and local (no API calls).
NFR-0-003: Keyword generation uses ANTHROPIC_MODEL_WORKER (Claude Sonnet).
NFR-0-004: All agent costs logged to pipeline_runs.total_cost_usd.

---

## ACCEPTANCE CRITERIA

```yaml
tests:
  - id: AC-0-001
    name: "Journal ranking produces ≥12 journals"
    input:
      topic_seed: "Physics-informed neural networks for turbulence modeling in rotating detonation engines"
    expected:
      journal_count: ">= 12"
      top_journal: "journal_of_propulsion_and_power"
      top_fit_score: ">= 8.0"

  - id: AC-0-002
    name: "Paper type classification is correct"
    input:
      topic_seed: "A novel PINN turbulence correction for RDE aerodynamics"
    expected:
      paper_type: "research_article"
      word_count_target:
        min: 8000
        max: 12000

  - id: AC-0-003
    name: "Keyword cloud meets minimum count"
    input:
      topic_seed: "any valid aerospace topic"
    expected:
      primary_keywords_count: ">= 5"
      secondary_keywords_count: ">= 10"
      database_keywords_count: ">= 20"

  - id: AC-0-004
    name: "LaTeX skeleton compiles without errors"
    expected:
      latex_compilation_exit_code: 0
      required_sections_present: true
      ai_disclosure_placeholder_present: true

  - id: AC-0-005
    name: "Stage completes within time budget"
    expected:
      duration_seconds: "< 900"
GATE-0 PAYLOAD SCHEMA
TypeScript

interface Gate0Payload {
  journal_ranking: JournalRanking[];
  recommended_journal: JournalId;
  recommended_paper_type: PaperType;
  word_count_target: { min: number; max: number };
  keyword_cloud: KeywordCloud;
  competing_groups: CompetingGroup[];
  latex_skeleton_s3_key: string;
  clarifying_questions?: string[];  // If topic was ambiguous
  researcher_actions_required: string[];
}
text


---

## 📄 File 7: `specs/stage-1-literature-archaeology/requirements.md`

```markdown
# Stage 1: Deep Literature Archaeology
# Spec ID: STAGE-1-REQ-001
# Status: APPROVED
# Implementing: LiteratureHarvestAgent, CitationGraphAgent, LiteratureRerankerAgent
# Max Duration: 4 hours
# Gate: GATE-1 (researcher reviews and approves reading list)

---

## BUSINESS CONTEXT

Poor literature coverage is the #1 reason top aerospace journals
reject papers. Reviewers who have published in this space WILL notice
missing seminal works. Stage 1 is the most thorough literature
archaeology system ever applied to aerospace research — querying 11
sources in parallel, expanding via citation graph, reranking with LLM
debate, and producing a tiered, annotated reading list of ≥ 95 papers.

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-1-001: LiteratureHarvestAgent MUST query ALL of the following sources:
  1. Semantic Scholar API (primary, 200M+ papers)
  2. NASA NTRS (NASA Technical Reports Server)
  3. arXiv API (cs.CE, physics.flu-dyn, eess.SY, cond-mat.mtrl-sci)
  4. Crossref API (DOI resolution + metadata)
  5. Elsevier ScienceDirect (Aerospace Science and Technology, Acta Astronautica)
  6. AIAA ARC (Aerospace Research Central) via web scraping
  7. DLR eLib (German Aerospace Center reports)
  8. ONERA Publications (French aerospace)
  9. JAXA Repository (Japanese aerospace)
  10. NATO STO reports
  11. NACA/NASA historical archive (pre-1958 foundational works)

Per source, per keyword: max 100 results per query.
Total raw candidates target: ≥ 800 before filtering.
Parallel execution: all 11 sources queried simultaneously (BullMQ parallel jobs).
:::END:::

:::STRICT_REQUIREMENT:::
FR-1-002: LiteratureRerankerAgent MUST implement the debate-based
reranking protocol:
  Round 1 (Broad harvest): 800+ raw candidates → keyword match filter → 200 survivors
  Round 2 (LLM reranking): For each of 200 candidates:
    - ProponentAgent: "Why is this paper relevant?"
    - OpponentAgent: "Why is this paper NOT relevant?"
    - JudgeAgent: Score 0–10, reason, tier assignment
  Round 3 (Citation expansion): Top 100 papers → trace citation graph
    via Semantic Scholar /paper/{id}/citations and /paper/{id}/references
    → add up to 50 additional papers from citation network
  Round 4 (Quality scoring): Final 150 papers → compute composite score:
    relevance (40%) + citation_count_normalized (20%) + impact_factor (20%) + recency (20%)
  Output: Tiered list of ≥ 95 papers (Tier 1: ≥20, Tier 2: ≥35, Tier 3: ≥25, Tier 4: ≥10)
:::END:::

:::STRICT_REQUIREMENT:::
FR-1-003: CitationGraphAgent MUST build a GitNexus-compatible knowledge
graph from the final paper set:
  Nodes: papers, authors, institutions, methodologies, phenomena, parameters
  Edges: "cites", "contradicts", "extends", "same_method", "same_phenomenon", "co_author"
  Output: graph.json (D3-compatible format) + graph.md (AeroWiki article)
  The graph MUST identify:
    - Hub papers (highest in-degree in this corpus)
    - Contested findings (papers with contradicting conclusions)
    - Active research groups (author clusters with recent papers)
:::END:::

:::STRICT_REQUIREMENT:::
FR-1-004: For EVERY paper in Tier 1 and Tier 2, the agent MUST
verify the DOI resolves correctly AND confirm these metadata fields:
  - title (exact match to Crossref record)
  - authors (ORCID-verified if available)
  - journal/conference name (exact official name)
  - year, volume, issue, pages
  - AIAA-formatted citation string
Papers with doi_verified: false MUST NOT appear in the manuscript bibliography.
:::END:::

FR-1-005: The agent MUST extract from each Tier 1 paper (LLM-assisted):
  - key_finding: 1–2 sentence summary of the main result
  - methodology_used: what computational/experimental method was used
  - gap_identified: what the paper itself acknowledges it did not address
  - parameter_ranges: what physical parameter space was covered

FR-1-006: The agent MUST produce a 2000-word "Research Landscape Summary"
markdown document covering:
  - What has been established (consensus)
  - What is actively contested (conflicting results)
  - What is completely unexplored (the gap this paper will fill)

FR-1-007: If fewer than 20 Tier 1 papers are found after all rounds,
the agent MUST escalate to the researcher via OpenClaw notification
and pause at GATE-1 with an explanation of the sparse literature landscape.

---

## NON-FUNCTIONAL REQUIREMENTS

NFR-1-001: Total stage duration MUST NOT exceed 4 hours wall time.
NFR-1-002: All source queries implement exponential backoff retry (RULE-042).
NFR-1-003: Semantic Scholar rate limit: 100 requests/5min (enforced by rate limiter).
NFR-1-004: Failed source queries (after 5 retries) are logged as warnings,
           not errors. Pipeline continues with available sources.
NFR-1-005: All raw API responses are archived to S3 for reproducibility.
NFR-1-006: Citation graph stored as: S3 + PostgreSQL (nodes/edges tables).

---

## ACCEPTANCE CRITERIA

```yaml
tests:
  - id: AC-1-001
    name: "Minimum paper count after all rounds"
    expected:
      tier_1_count: ">= 20"
      tier_2_count: ">= 35"
      tier_3_count: ">= 20"
      tier_4_count: ">= 10"
      total_count: ">= 95"

  - id: AC-1-002
    name: "DOI verification for Tier 1 and Tier 2"
    expected:
      tier_1_doi_verified_pct: ">= 95"
      tier_2_doi_verified_pct: ">= 90"

  - id: AC-1-003
    name: "AIAA citation format correctness"
    validator: "packages/latex-engine/src/validators/citation-validator.ts"
    expected:
      format_error_count: 0

  - id: AC-1-004
    name: "Citation graph connectivity"
    expected:
      graph_node_count: ">= 95"
      graph_edge_count: ">= 50"
      hub_papers_identified: ">= 3"
      contested_findings_identified: ">= 1"

  - id: AC-1-005
    name: "Landscape summary completeness"
    expected:
      word_count: ">= 1800"
      sections_present: ["consensus", "contested", "gap"]

  - id: AC-1-006
    name: "Stage completes within time budget"
    expected:
      duration_seconds: "< 14400"
text


---

## 📄 File 8: `specs/stage-4-evidence-generation/requirements.md`

```markdown
# Stage 4: Computational Evidence Generation
# Spec ID: STAGE-4-REQ-001
# Status: APPROVED
# Implementing: CFDSetupAgent, CFDSolverAgent, CFDPostProcessor,
#               StatisticalValidationAgent
# Max Duration: 48 hours (problem-dependent)
# Gates: GATE-4A (grid convergence), GATE-4B (validation), GATE-4C (figures)

---

## BUSINESS CONTEXT

Every quantitative claim in an AIAA paper must be traceable to a
verified computation or a cited source. Stage 4 is where AeroScribe
generates the computational evidence that makes the paper's
contributions credible. This is the autoresearch loop applied to
aerospace CFD — running overnight, evolving configurations, keeping
improvements, reverting regressions, building a SHA256-verified chain
of provenance from computation to manuscript number.

No number enters the manuscript from Stage 5 without a VerifiedResult
record. This is non-negotiable (RULE-041).

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-4-001: CFDSetupAgent MUST generate valid solver input files for
the selected solver (SU2, OpenFOAM, or Eilmer4) from the contribution
statement produced in Stage 3. Input files MUST include:
  - Geometry definition (OpenVSP .vsp3 or GMSH .geo format)
  - Mesh generation script (GMSH Python API)
  - Solver configuration (SU2: config.cfg | OpenFOAM: system/ | Eilmer4: prep.lua)
  - Boundary conditions derived from contribution statement
  - Turbulence model specification (from contribution statement)
  - Operating conditions: [Mach, Re, altitude, α-range]
All generated files MUST be validated by a syntax checker before
the first solver run begins.
:::END:::

:::STRICT_REQUIREMENT:::
FR-4-002: Grid Convergence Study is MANDATORY before any result
is used in a manuscript. Protocol:
  - Coarse mesh: target y+ = 5, ~500k cells
  - Medium mesh: target y+ = 2, ~2M cells
  - Fine mesh: target y+ = 1, ~8M cells
  Richardson extrapolation MUST be applied to key metrics.
  Grid Convergence Index (GCI) MUST be computed and reported.
  GCI < 5% on key metrics required for GATE-4A approval.
  Results stored as VerifiedResult (result_type: "grid_convergence").
:::END:::

:::STRICT_REQUIREMENT:::
FR-4-003: The autoresearch loop (configuration optimization) MUST:
  - Run for a fixed wall time budget (CFD_MAX_WALL_TIME_MINUTES, default 15 min/solve)
  - Kill any solve exceeding the budget (RULE-052)
  - Record EVERY solve attempt to VerifiedRegistry (pass or fail)
  - Implement keep/revert logic via git:
      if metric_new > metric_best: git commit (with metric in message)
      else: git revert
  - Loop until: convergence criterion met OR researcher halts
  Convergence criterion: < 0.1% change in primary metric over 5 consecutive keeps
:::END:::

:::STRICT_REQUIREMENT:::
FR-4-004: Validation against experimental data is MANDATORY for
papers targeting AIAA JPP, AIAA Journal, or Journal of Aircraft.
The agent MUST:
  1. Identify reference experimental datasets from literature (Stage 1 output)
  2. Extract experimental data points (digitized from papers if needed via WebPlotDigitizer API)
  3. Compare computational results against experiment:
     - Compute: RMSE, MAE, R², bias, maximum deviation
     - Generate: error bar plots with 95% CI on both computational and experimental data
     - Report: validation uncertainty per AIAA V&V standard (AIAA-G-077-1998)
  Validation results stored as VerifiedResult (result_type: "statistical_validation").
  GATE-4B requires: R² ≥ 0.95 on primary validation metric OR researcher approval with justification.
:::END:::

:::STRICT_REQUIREMENT:::
FR-4-005: VerifiedRegistry integrity chain for EVERY result:
  1. Solver completes → output file written to CFD_SCRATCH_DIR
  2. SHA256 computed on output file
  3. VerifiedResult record created (append-only)
  4. Output file copied to S3 (key: runs/{run_id}/cfd/{result_id}/)
  5. SHA256 verified against S3 copy
  6. result_id logged in manuscript data provenance map
  Any break in this chain: PIPELINE HALT (RULE-041)
:::END:::

:::STRICT_REQUIREMENT:::
FR-4-006: CFDPostProcessor MUST generate publication-quality figures
using pgfplots (not matplotlib raster exports):
  - All figures: vector PDF format
  - Font: Helvetica Neue 9pt (AIAA standard)
  - Column width: 3.5 inches (single-column) or 7.25 inches (full-width)
  - Color scheme: AIAA approved palette (colorblind-safe)
  - All axes: labeled with quantity name + SI unit in brackets [unit]
  - All data series: with error bars (uncertainty from VerifiedResult)
  - Resolution standard: vector (infinite DPI)
  Each figure file includes: VerifiedResult SHA256 hash in pgfplots comment
:::END:::

FR-4-007: StatisticalValidationAgent MUST run uncertainty quantification
on ALL reported metrics using:
  - Aleatory uncertainty: from grid convergence (GCI)
  - Epistemic uncertainty: from turbulence model sensitivity
    (run same case with k-ε, k-ω SST, and SA models; report spread)
  - Boundary condition uncertainty: ±5% on freestream conditions
  Combined uncertainty reported as combined standard uncertainty (JCGM 100:2008).

FR-4-008: The evidence generation log MUST be a git repository with:
  - One commit per accepted configuration
  - Commit message format: "exp-{N}: metric={value} vs best={best} [KEEP|REVERT]"
  - Tag format: "best-{timestamp}" on the best configuration at each milestone
  This git repo is uploaded to S3 and linked in the paper's data availability statement.

---

## SOLVER CONFIGURATION TEMPLATES

### SU2 Configuration Template
```ini
# Generated by AeroScribe CFDSetupAgent
# Run ID: {run_id} | Stage: 4 | Experiment: {exp_n}
# VerifiedRegistry will create record after solve completes

SOLVER= RANS
KIND_TURB_MODEL= {turbulence_model}    # SST | SA | KE
MATH_PROBLEM= DIRECT
RESTART_SOL= NO

MACH_NUMBER= {mach}
AOA= {alpha_deg}
REYNOLDS_NUMBER= {reynolds}
REYNOLDS_LENGTH= {ref_length}

MARKER_FAR= (farfield)
MARKER_EULER= (airfoil)
MARKER_PLOTTING= (airfoil)
MARKER_MONITORING= (airfoil)

NUM_METHOD_GRAD= GREEN_GAUSS
CFL_NUMBER= {cfl}
CFL_ADAPT= YES
MAX_DELTA_TIME= 1E6
LINEAR_SOLVER= FGMRES
LINEAR_SOLVER_ERROR= 1E-10
LINEAR_SOLVER_ITER= 20

CONV_FIELD= RMS_DENSITY
CONV_MIN_ITER= 100
CONV_CAUCHY_ELEMS= 100
CONV_CAUCHY_EPS= 1E-10
ITER= {max_iterations}

OUTPUT_FILES= SURFACE_CSV, RESTART
SURFACE_FILENAME= surface_{exp_n}
VOLUME_FILENAME= volume_{exp_n}
CONV_FILENAME= history_{exp_n}
TABULAR_FORMAT= CSV
ACCEPTANCE CRITERIA
YAML

tests:
  - id: AC-4-001
    name: "Grid convergence study produces GCI < 5%"
    expected:
      grid_convergence_index_pct: "< 5.0"
      richardson_extrapolation_computed: true
      three_mesh_levels_completed: true

  - id: AC-4-002
    name: "Validation against experiment meets R² threshold"
    expected:
      r_squared: ">= 0.95"
      validation_dataset_cited: true
      error_bars_on_figure: true

  - id: AC-4-003
    name: "VerifiedRegistry chain unbroken"
    validator: "packages/verified-registry/src/validators/chain-validator.ts"
    expected:
      all_sha256_verified: true
      no_gaps_in_chain: true
      all_results_have_s3_backup: true

  - id: AC-4-004
    name: "All figures are vector PDF"
    expected:
      figure_format: "pdf"
      is_vector: true
      font_correct: "helvetica-9pt"
      has_axis_labels_with_units: true
      has_error_bars: true

  - id: AC-4-005
    name: "Autoresearch loop records every experiment"
    expected:
      all_experiments_in_verified_registry: true
      git_commit_per_accepted_config: true
      convergence_criterion_documented: true
text


---

## 📄 File 9: `specs/stage-5-paper-synthesis/requirements.md`

```markdown
# Stage 5: Paper Synthesis & Structured Writing
# Spec ID: STAGE-5-REQ-001
# Status: APPROVED
# Implementing: ArchitectureAgent, SectionWriterAgent, LaTeXRenderAgent
# Max Duration: 6 hours
# Gate: GATE-5 (section outlines approved before writing begins)

---

## BUSINESS CONTEXT

AeroScribe writes papers hierarchically: architecture before sections,
sections before paragraphs, paragraphs before sentences. This is not
how humans write — but it is how AI agents produce the fewest
hallucinations and the most structurally coherent manuscripts.

GATE-5 fires BETWEEN Level 2 (section outlines) and Level 4 (sentence
generation). The researcher reads and approves the outlines — essentially
approving the logical argument of the paper — before any prose is
written. A wrong outline caught here costs 30 minutes. A wrong outline
caught during revision costs days.

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-5-001: ArchitectureAgent MUST produce the paper architecture
in strict hierarchical order:

Level 1 — Paper Architecture (to researcher for concept approval):
  document: {
    sections: SectionArchitecture[]  // ordered list
    argument_flow: string[]          // 1-sentence summary of each section's role
    contribution_coverage_map: {
      contribution_id: string,
      covered_in_sections: string[]
    }[]
  }

Level 2 — Section Outlines (GATE-5 trigger):
  For each section:
    outline: {
      section_type: SectionType,
      title: string,
      paragraphs: ParagraphPlan[],   // ordered
      target_word_count: number,
      figures_included: string[],    // figure IDs from Stage 4
      tables_included: string[],
      key_references: string[]       // reference IDs from Stage 1
    }

Level 3 — Paragraph Plans (internal, no gate):
  For each paragraph:
    plan: {
      topic_sentence: string,        // First sentence, written first
      supporting_points: string[],   // What evidence supports this
      citation_ids: string[],        // References to cite
      figure_ref: string | null,     // If this paragraph introduces a figure
      verified_result_ids: string[]  // VerifiedResults to cite
    }

Level 4 — Sentence Generation (after GATE-5 approval):
  Full prose written, following paragraph plan exactly.
  Every claim with a number → must reference a VerifiedResult ID.
  Every claim about literature → must reference a LiteratureReference ID.

Level 5 — LaTeX Rendering:
  Prose + equations → LaTeX via LaTeXRenderAgent
  Equations → amsmath environments, numbered consecutively
  Tables → booktabs \toprule \midrule \bottomrule
:::END:::

:::STRICT_REQUIREMENT:::
FR-5-002: Abstract MUST be written LAST, after all sections are complete.
Structure enforced by ArchitectureAgent:
  S1 (≤ 50 words): Problem statement + motivation
  S2 (≤ 50 words): Approach (method used)
  S3 (≤ 80 words): Key quantitative result (MUST include specific number)
  S4 (≤ 50 words): Significance / broader impact
  Total: ≤ 250 words (enforced — LaTeX compilation fails if > 250 words in abstract)
:::END:::

:::STRICT_REQUIREMENT:::
FR-5-003: Introduction MUST follow the 7-paragraph template:
  §1: Why this problem matters (hook + motivation)
  §2-4: Literature synthesis (builds on Stage 1 landscape summary)
        — each paragraph covers one thematic cluster of the literature
  §5: The gap (explicit statement of what is missing)
  §6: Contribution statement (verbatim from Stage 3, approved by researcher)
  §7: Paper roadmap ("Section II describes..., Section III presents...")
  Word count: 600–900 words for research articles.
:::END:::

:::STRICT_REQUIREMENT:::
FR-5-004: Conclusions MUST follow the 5-paragraph template:
  §1: Problem restated (1 paragraph)
  §2: Approach summary (1 paragraph)
  §3: Key findings as numbered list (minimum 3 findings, each with specific quantitative result)
  §4: Limitations and scope (explicit, honest)
  §5: Future work (3–5 specific, actionable items)
  NO new results may appear in Conclusions that were not in Results & Discussion.
:::END:::

:::STRICT_REQUIREMENT:::
FR-5-005: Every figure placed in the manuscript MUST:
  1. Be referenced in the text BEFORE it appears: "...as shown in Fig. X"
  2. Have a self-explanatory caption (reader should understand without reading body text)
  3. Be linked to a VerifiedResult record (SHA256 in LaTeX comment)
  4. Appear within 2 LaTeX columns of its first text reference
  Figures without VerifiedResult links: BLOCKED from manuscript (not optional).
:::END:::

:::STRICT_REQUIREMENT:::
FR-5-006: Equations MUST:
  - Use amsmath environments (\begin{equation}, \begin{align})
  - Be numbered consecutively throughout paper
  - Have every symbol defined in Nomenclature section
  - Use consistent notation (auto-checked: same symbol cannot have two meanings)
  - Include units in dimensional equations (via \si{} from siunitx package)
:::END:::

FR-5-007: SectionWriterAgent uses Claude claude-opus-4-5 (ANTHROPIC_MODEL_ORCHESTRATOR)
for all prose generation. Claude claude-sonnet-4-5 is not used for manuscript writing.
Rationale: research paper prose quality requires the highest available model.

FR-5-008: The Discussion section MUST explicitly connect each result back to
the original research question/contribution stated in the Introduction.
A "connection map" is generated by ArchitectureAgent and checked by the
LaTeXRenderAgent: every contribution claim must have a corresponding
Results paragraph that supports it.

FR-5-009: Word count targets per section (research article, 10,000 words total):
  Introduction: 700 words
  Methodology: 3,000 words
  Results: 2,500 words
  Discussion: 1,500 words
  Conclusions: 600 words
  Abstract: 250 words
  Nomenclature + References: ~1,000 words equivalent

---

## LATEX ENGINE REQUIREMENTS

:::STRICT_REQUIREMENT:::
LR-5-001: All figures generated as pgfplots PDF (not \includegraphics of rasters).
The LaTeXRenderAgent generates pgfplots code from raw CSV data (S3 download).
This ensures: reproducibility, resolution independence, style consistency.
```latex
% Example generated pgfplots figure
\begin{figure}[htb]
  \centering
  % VerifiedResult: SHA256=abc123... | Run: {run_id} | Result: {result_id}
  \begin{tikzpicture}
    \begin{axis}[
      width=3.5in,
      height=2.5in,
      xlabel={Angle of Attack, $\alpha$ [deg]},
      ylabel={Lift Coefficient, $C_L$ [-]},
      legend pos=north west,
      grid=major,
      font=\footnotesize,
    ]
      \addplot+[error bars/.cd, y dir=both, y explicit]
        table[x=alpha, y=CL, y error=CL_unc, col sep=comma]
        {data/lift_curve_{result_id}.csv};
      \addlegendentry{AeroScribe (PINN-corrected RANS)}
      \addplot+[mark=o, only marks]
        table[x=alpha_exp, y=CL_exp, col sep=comma]
        {data/experiment_anand2024.csv};
      \addlegendentry{Anand et al. (2024), Exp.}
    \end{axis}
  \end{tikzpicture}
  \caption{Lift coefficient vs. angle of attack comparison between
           PINN-corrected RANS (present) and experimental data of
           Anand et al.~\cite{Anand2024}. Error bars represent
           combined uncertainty at 95\% confidence.}
  \label{fig:lift_curve_validation}
\end{figure}
:::END:::

ACCEPTANCE CRITERIA
YAML

tests:
  - id: AC-5-001
    name: "LaTeX compiles without errors"
    expected:
      latex_exit_code: 0
      bibtex_warnings: 0
      overfull_hbox_count: "< 5"

  - id: AC-5-002
    name: "Abstract word count"
    expected:
      word_count: "<= 250"
      sentence_count: 4
      has_quantitative_result: true

  - id: AC-5-003
    name: "Every figure linked to VerifiedResult"
    expected:
      figures_without_verified_result: 0

  - id: AC-5-004
    name: "Every contribution claim supported by result"
    validator: "packages/latex-engine/src/validators/contribution-coverage.ts"
    expected:
      uncovered_contributions: 0

  - id: AC-5-005
    name: "Nomenclature complete"
    expected:
      symbols_without_definition: 0
      symbols_without_unit: 0

  - id: AC-5-006
    name: "Reference count meets journal norms"
    target_journal: "journal_of_propulsion_and_power"
    expected:
      reference_count:
        min: 30
        max: 80
      tier_1_references_cited_pct: ">= 85"
text


---

## 📄 File 10: `specs/stage-6-peer-review-council/requirements.md`

```markdown
# Stage 6: Internal Peer Review Council
# Spec ID: STAGE-6-REQ-001
# Status: APPROVED
# Implementing: ReviewerAAgent, ReviewerBAgent, ReviewerCAgent,
#               ReviewerDAgent, MetaReviewerAgent
# Max Duration: 4 hours
# Gate: GATE-6 (researcher reads review reports before Stage 7)

---

## BUSINESS CONTEXT

Before a paper is submitted to any aerospace journal, it must survive
the AeroScribe Internal Review Council — five AI reviewer personas
calibrated to the archetypes encountered in real AIAA, JPP, and
Journal of Aircraft peer review. The goal is to surface every major
weakness before a real reviewer sees it, saving the researcher from
a demoralizing "major revision" or "reject" decision.

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-6-001: Five distinct reviewer agents MUST evaluate the paper
independently (no shared context between reviewers):

Reviewer A — "The Methodology Purist"
  Model: ANTHROPIC_MODEL_ORCHESTRATOR (claude-opus-4-5)
  System prompt: packages/review-council/prompts/reviewer-a-methodology.md
  Focus areas:
    - CFD methodology rigor (grid independence, turbulence model justification)
    - Uncertainty quantification completeness
    - Validation quality (dataset appropriateness, error metric choice)
    - Reproducibility (can another researcher reproduce from the paper?)
  Known persona bias: Skeptical of ML/AI methods without extensive validation

Reviewer B — "The Literature Expert"
  Model: ANTHROPIC_MODEL_ORCHESTRATOR
  System prompt: packages/review-council/prompts/reviewer-b-literature.md
  Focus areas:
    - Missing seminal references (queries AeroWiki + citation graph)
    - Accurate characterization of related work
    - Novelty genuinely not overstated
    - Correct attribution of prior methods
  Known persona bias: Will check if papers from active competing groups are cited

Reviewer C — "The Physical Reasoner"
  Model: ANTHROPIC_MODEL_ORCHESTRATOR
  System prompt: packages/review-council/prompts/reviewer-c-physics.md
  Focus areas:
    - Physical plausibility of all results (order-of-magnitude checks)
    - Dimensional consistency of all equations
    - Limiting case behavior (do results approach known limits?)
    - Scaling law compliance
  Known persona bias: Demands dimensional analysis and asymptotic validation

Reviewer D — "The Associate Editor"
  Model: ANTHROPIC_MODEL_WORKER (claude-sonnet-4-5)
  System prompt: packages/review-council/prompts/reviewer-d-editor.md
  Focus areas:
    - Scope fit for target journal
    - Paper length compliance
    - Structure and flow
    - Abstract quality and completeness
    - English clarity and precision
    - AIAA format compliance (citation format, figure format, etc.)
  Known persona bias: Will desk-reject papers outside scope; checks AI disclosure

MetaReviewer — "The Editor-in-Chief"
  Model: ANTHROPIC_MODEL_ORCHESTRATOR
  System prompt: packages/review-council/prompts/meta-reviewer.md
  Input: all four reviewer reports (in parallel, not sequentially)
  Output: overall recommendation + priority concerns + accept probability estimate
:::END:::

:::STRICT_REQUIREMENT:::
FR-6-002: Each reviewer MUST produce a ReviewReport with this exact structure:
  {
    summary: string (50–100 words),
    recommendation: "accept" | "minor_revision" | "major_revision" | "reject",
    confidence: "high" | "medium" | "low",
    major_concerns: ReviewConcern[],      // ≥ 0, each with location + resolution
    minor_concerns: ReviewConcern[],      // ≥ 0
    specific_questions: string[],          // Verbatim questions reviewer would ask
    positive_aspects: string[],            // What the paper does well
    format_violations: FormatViolation[]   // Reviewer D only, others empty
  }
:::END:::

:::STRICT_REQUIREMENT:::
FR-6-003: DIAGPaper weakness detection MUST run on the manuscript
before the review council sees it, and its output MUST be included
in each reviewer's context. DIAGPaper identifies:
  - Logical gaps in argument structure
  - Unsupported claims (claims without citation or VerifiedResult)
  - Inconsistent results (numbers in text don't match figures)
  - Missing error bars / uncertainty quantification
  - Conclusion overreach (conclusions not supported by results)
:::END:::

:::STRICT_REQUIREMENT:::
FR-6-004: Reviewer Calibration — the review council MUST be calibrated
against the gold set at packages/review-council/calibration/gold-set.json
(50 historical AIAA accept/reject decisions). Calibration MUST run:
  - On system initialization (one-time)
  - When any reviewer prompt is modified
  - Monthly (scheduled job)
  Calibration metrics logged: FNR, FPR, balanced accuracy per reviewer persona.
  If balanced_accuracy < 0.70 for any reviewer: alert Engineering Lead.
:::END:::

FR-6-005: MetaReviewerAgent produces an "Accept Probability Estimate":
  A calibrated probability (0.0–1.0) that this paper would be accepted
  by the target journal in its current state. This is purely informational
  for the researcher — not used to gate the pipeline. Logged to paper record.

FR-6-006: The R&R Traceability Matrix MUST be pre-generated from the
review council output before GATE-6. This gives the researcher a clear
view of what must be addressed in Stage 7.

---

## REVIEWER PROMPT SPECIFICATIONS

### Reviewer A — Methodology Purist (packages/review-council/prompts/reviewer-a-methodology.md)

```markdown
You are a senior aerospace engineer with 25 years of experience in
computational fluid dynamics and experimental aerodynamics. You are
reviewing a paper for the {target_journal}.

Your expertise: CFD methodology, turbulence modeling, experimental
validation, uncertainty quantification. You are known for rigorous
standards and skepticism of unvalidated computational approaches.

Your review MUST address:
1. Is the CFD methodology described in sufficient detail for reproducibility?
2. Is grid independence demonstrated with a proper convergence study?
3. Is uncertainty quantification performed and reported per AIAA V&V standards?
4. Is the validation dataset appropriate for the claims being made?
5. Are turbulence model limitations acknowledged?
6. Are the error metrics appropriate (not cherry-picked)?

You MUST identify every instance where:
- A numerical result is presented without uncertainty bounds
- A computational method is used outside its validated envelope
- A claim is made that the results do not support
- The experimental comparison has methodological flaws

Format your review as JSON matching the ReviewReport schema.
Be specific: cite section numbers, equation numbers, figure numbers.
ACCEPTANCE CRITERIA
YAML

tests:
  - id: AC-6-001
    name: "All five reviewers complete independently"
    expected:
      reviewers_complete: 5
      cross_contamination: false    # Verified: no shared context
      duration_seconds: "< 14400"

  - id: AC-6-002
    name: "ReviewReport schema compliance"
    expected:
      all_reports_schema_valid: true
      all_locations_cited: true     # Every concern has specific location

  - id: AC-6-003
    name: "Calibration baseline met"
    expected:
      all_reviewer_balanced_accuracy: ">= 0.70"

  - id: AC-6-004
    name: "DIAGPaper runs before council sees manuscript"
    expected:
      diagpaper_complete_before_review: true
      diagpaper_output_in_reviewer_context: true

  - id: AC-6-005
    name: "R&R Traceability Matrix generated"
    expected:
      matrix_generated: true
      all_major_concerns_in_matrix: true
      all_minor_concerns_in_matrix: true
text


---

## 📄 File 11: `specs/stage-7-revision-compliance/requirements.md`

```markdown
# Stage 7: Revision, Rebuttal & Journal Compliance
# Spec ID: STAGE-7-REQ-001
# Status: APPROVED
# Implementing: RevisionAgent, ComplianceAgent
# Max Duration: 4 hours (automated) + researcher review time
# Gate: GATE-7 (researcher approves response-to-reviewers before Stage 8)

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-7-001: RevisionAgent MUST address every concern in the R&R
Traceability Matrix. For each concern:
  1. Quote the reviewer concern verbatim
  2. State the resolution approach
  3. Execute the resolution (additional computation, text rewrite, or citation add)
  4. Update the manuscript with the change (tracked via \changed{} LaTeX macro)
  5. Record the location of the change in the manuscript
  6. Mark the concern as addressed: true in the matrix
  BLOCKED: RevisionAgent CANNOT mark a concern as addressed without
  actually making the corresponding manuscript change.
:::END:::

:::STRICT_REQUIREMENT:::
FR-7-002: Response-to-Reviewers document MUST follow this structure
for each reviewer:
  ## Reviewer [A/B/C/D] Response
  **We thank Reviewer [X] for their careful reading...**

  ### Concern 1: [Reviewer concern title]
  **Reviewer Comment:** "[Verbatim reviewer comment]"
  **Author Response:** [Response text]
  **Manuscript Change:** Section [X], [description of change]
  **Revised Text:** "[Before] → [After]" (for text changes)
                   "[Old value] → [New value]" (for numerical changes)

  Minimum response length per major concern: 100 words.
:::END:::

:::STRICT_REQUIREMENT:::
FR-7-003: JournalComplianceAgent MUST run the full pre-submission
checklist from packages/journal-profiles/checklists/{journal_id}.yaml
and achieve 100% compliance before GATE-7:

  Core checklist items (ALL must pass):
    ✓ Abstract ≤ word_limit words
    ✓ Paper length within journal norms (min/max word count)
    ✓ All figures at correct format (vector PDF)
    ✓ All figure captions complete and self-explanatory
    ✓ Nomenclature complete (all symbols defined)
    ✓ Equations numbered consecutively
    ✓ All references in correct citation format
    ✓ All DOIs resolved and verified (doi_verified: true)
    ✓ Author information anonymized (if double-blind)
    ✓ AI usage statement present and correct for venue
    ✓ Data availability statement present
    ✓ Manuscript compiles to PDF without LaTeX errors
    ✓ All \changed{} macros removed for final submission version
    ✓ Supplemental materials package prepared (if required)
    ✓ Cover letter drafted
    ✓ Suggested reviewers list prepared (5 names, no conflicts)
:::END:::

:::STRICT_REQUIREMENT:::
FR-7-004: AI Disclosure Statement MUST be generated per venue:
  The statement template is in packages/journal-profiles/ai-disclosure/{journal_id}.md
  It MUST include:
    - What AI tools were used (AeroScribe, underlying models)
    - What tasks they performed (literature synthesis, CFD setup, writing assistance)
    - What the human researcher contributed (direction, judgment, validation, authorship)
    - Compliance with venue's specific AI policy
  The statement MUST NOT claim AI authorship.
  The statement MUST be venue-specific (not a generic statement).
:::END:::

---

## ACCEPTANCE CRITERIA

```yaml
tests:
  - id: AC-7-001
    name: "All concerns addressed in R&R matrix"
    expected:
      major_concerns_addressed_pct: 100
      minor_concerns_addressed_pct: ">= 90"
      unaddressed_major_concerns: 0

  - id: AC-7-002
    name: "Journal compliance checklist 100%"
    expected:
      compliance_pct: 100
      latex_compilation_errors: 0
      bibtex_warnings: 0

  - id: AC-7-003
    name: "AI disclosure statement present"
    expected:
      statement_present: true
      venue_specific: true
      no_ai_authorship_claim: true

  - id: AC-7-004
    name: "Response document completeness"
    expected:
      all_reviewers_addressed: true
      min_words_per_major_concern: ">= 100"
      changed_macros_removed_in_final: true
text


---

## 📄 File 12: `specs/stage-8-aerowiki/requirements.md`

```markdown
# Stage 8: Compounding AeroWiki & Institutional Memory
# Spec ID: STAGE-8-REQ-001
# Status: APPROVED
# Implementing: WikiCompilerAgent, SynthesisAgent
# Max Duration: 1 hour
# Gate: GATE-8 (final approval before submission package delivered)

---

## FUNCTIONAL REQUIREMENTS

:::STRICT_REQUIREMENT:::
FR-8-001: WikiCompilerAgent MUST create or update AeroWiki articles
after every completed pipeline run. Articles MUST be created for:

  Per-paper articles:
    papers/{run_id}/summary.md              — paper overview + contributions
    papers/{run_id}/methodology.md          — what computational approach was used
    papers/{run_id}/key-findings.md         — quantitative results with uncertainty
    papers/{run_id}/open-questions.md       — what was NOT answered
    papers/{run_id}/reviewer-insights.md   — what the review council found weak/strong

  Domain knowledge articles (created or updated):
    {domain}/{specific-topic}.md           — e.g., propulsion/rde-turbulence-modeling.md
    literature/{topic}-key-papers.md       — annotated bibliography for this topic
    literature/{topic}-contested-findings.md — unresolved debates
    methodology/{method-used}.md           — how the computational approach works
    journal-intelligence/{journal_id}.md   — editorial preferences observed

  Cross-links: WikiCompilerAgent MUST scan all articles for entity mentions
  and create bidirectional markdown links between related articles.
:::END:::

:::STRICT_REQUIREMENT:::
FR-8-002: SynthesisAgent MUST check after every 5 completed runs
in the same domain: if ≥ 5 runs in domain X, generate a survey
article: {domain}/state-of-the-field-{year}.md
  This article synthesizes:
    - All contributions made across the 5+ papers
    - Cumulative knowledge gained
    - Outstanding open questions across all papers
    - Recommended priority topics for next research
  This survey article is itself a publishable product for Progress
  in Aerospace Sciences (scope: comprehensive survey articles).
:::END:::

:::STRICT_REQUIREMENT:::
FR-8-003: The Hermes learning loop MUST update researcher-specific
skills after each run:
  - journal_targeting_skill: updated with this run's journal fit data
  - reviewer_preference_skill: updated with this run's review council findings
  - domain_knowledge_skill: updated with new domain wiki articles
  Skills are stored at skills/{researcher_id}/ and loaded at next pipeline start.
:::END:::

FR-8-004: The submission package MUST be assembled as a ZIP archive:
  submission_{run_id}_{journal_id}_{date}.zip
  Contents:
    ├── manuscript.pdf           (final compiled PDF)
    ├── manuscript.tex           (LaTeX source)
    ├── figures/                 (all pgfplots source .tex files)
    ├── data/                    (all raw data CSV files)
    ├── bibliography.bib         (BibTeX file)
    ├── response_to_reviewers.pdf (if resubmission)
    ├── cover_letter.pdf
    ├── supplemental/            (code, additional data if required)
    ├── ai_disclosure.pdf
    └── data_availability.md

FR-8-005: The submission package MUST be uploaded to S3 and a
presigned download URL (7-day expiry) delivered to researcher via:
  - Dashboard: download button appears
  - Email (SMTP): submission package ready notification
  - Slack: notification with download link
  - OpenClaw: multi-channel delivery per researcher preferences

---

## ACCEPTANCE CRITERIA

```yaml
tests:
  - id: AC-8-001
    name: "Wiki articles created for all required categories"
    expected:
      paper_articles_count: ">= 5"
      domain_articles_created_or_updated: ">= 3"
      cross_links_created: ">= 10"

  - id: AC-8-002
    name: "Survey article triggers at 5 same-domain runs"
    precondition: "runs_in_domain >= 5"
    expected:
      survey_article_created: true
      survey_word_count: ">= 5000"

  - id: AC-8-003
    name: "Submission package completeness"
    expected:
      manuscript_pdf_present: true
      manuscript_tex_present: true
      all_figures_included: true
      all_data_csvs_included: true
      ai_disclosure_present: true
      cover_letter_present: true
      zip_archive_valid: true

  - id: AC-8-004
    name: "Researcher notifications delivered"
    expected:
      slack_notification_sent: true
      email_notification_sent: true
      dashboard_download_url_active: true
text


---

## 📄 File 13: `specs/_global/journal-profiles.md`

```markdown
# AeroScribe — Journal Profiles Database Specification
# Spec ID: GLOBAL-JP-001
# Status: APPROVED
# Location: packages/journal-profiles/src/profiles/

---

## JOURNAL PROFILE SCHEMA

```typescript
interface JournalProfile {
  id: JournalId;
  name: string;                        // Official full name
  publisher: string;
  issn_print: string | null;
  issn_online: string | null;
  impact_factor: number | null;        // Most recent
  h_index: number | null;
  scope_keywords: string[];            // For fit scoring
  scope_description: string;           // Full scope text
  out_of_scope: string[];              // Explicitly excluded topics
  paper_types: PaperTypeConfig[];
  review_type: "single_blind" | "double_blind" | "open";
  typical_reviewers: number;           // How many reviewers assigned
  typical_review_weeks: number;        // Median time to first decision
  acceptance_rate: number | null;      // 0.0–1.0
  latex_template: string;              // Template file name
  citation_style: string;              // "aiaa_numeric" | "aiaa_author_year"
  ai_policy: AIPolicy;
  section_requirements: SectionRequirement[];
  word_count_limits: WordCountLimits;
  figure_requirements: FigureRequirements;
  data_availability_required: boolean;
  code_availability_required: boolean;
  submission_url: string;
  author_guidelines_url: string;
  checklist_file: string;              // Path to YAML checklist
}
JOURNAL PROFILES
AIAA Journal (flagship)
YAML

id: aiaa_journal
name: "AIAA Journal"
publisher: "American Institute of Aeronautics and Astronautics"
issn_print: "0001-1452"
issn_online: "1533-385X"
impact_factor: 2.1
scope_keywords:
  - aeroacoustics
  - aerodynamics
  - combustion
  - propulsion fundamentals
  - fluid mechanics
  - reacting flows
  - aerospace environment
  - structural mechanics
  - aerospace materials
  - thermomechanics
out_of_scope:
  - spacecraft operations
  - mission design
  - avionics systems
  - human factors
paper_types:
  - type: research_article
    word_count: {min: 6000, max: 14000}
    description: "Original archival research"
  - type: technical_note
    word_count: {min: 2500, max: 3500}
    description: "Limited scope new data"
  - type: design_forum
    word_count: {min: 3000, max: 8000}
    description: "Design methodology"
  - type: survey
    word_count: {min: 10000, max: 25000}
    description: "Comprehensive review"
review_type: single_blind
typical_reviewers: 3
typical_review_weeks: 12
acceptance_rate: 0.18
latex_template: "aiaa-journal-2026"
citation_style: aiaa_numeric
ai_policy:
  disclosure_required: true
  authorship_prohibited: true
  template: "ai-disclosure/aiaa-journal.md"
section_requirements:
  - abstract: {required: true, max_words: 250}
  - nomenclature: {required: true}
  - introduction: {required: true}
  - conclusions: {required: true}
  - acknowledgments: {required: false}
  - references: {required: true}
data_availability_required: false
code_availability_required: false
submission_url: "https://arc.aiaa.org/journal/aiaaj"
author_guidelines_url: "https://arc.aiaa.org/page/aiaaj/author-instructions"
checklist_file: "checklists/aiaa_journal.yaml"
Journal of Propulsion and Power
YAML

id: journal_of_propulsion_and_power
name: "Journal of Propulsion and Power"
publisher: "American Institute of Aeronautics and Astronautics"
issn_print: "0748-4658"
issn_online: "1533-3876"
impact_factor: 2.3
scope_keywords:
  - airbreathing propulsion
  - electric propulsion
  - advanced propulsion
  - solid rockets
  - liquid rockets
  - fuels and propellants
  - power generation
  - power conversion
  - combustion
  - fluid mechanics (propulsion)
  - solid mechanics (propulsion)
  - turbomachinery
  - scramjet
  - rotating detonation engines
  - turbofan
  - turbojet
  - ramjet
out_of_scope:
  - aircraft structures (non-propulsion)
  - avionics
  - aerodynamics (non-propulsion related)
paper_types:
  - type: research_article
    word_count: {min: 6000, max: 12000}
  - type: technical_note
    word_count: {min: 2500, max: 3500}
review_type: single_blind
typical_reviewers: 3
typical_review_weeks: 14
acceptance_rate: 0.22
latex_template: "aiaa-jpp-2026"
citation_style: aiaa_numeric
section_requirements:
  - abstract: {required: true, max_words: 250}
  - nomenclature: {required: true}
  - introduction: {required: true}
  - methodology: {required: true}
  - results: {required: true}
  - conclusions: {required: true}
  - references: {required: true}
checklist_file: "checklists/jpp.yaml"
Journal of Aircraft
YAML

id: journal_of_aircraft
name: "Journal of Aircraft"
publisher: "American Institute of Aeronautics and Astronautics"
issn_print: "0021-8669"
issn_online: "1533-3868"
impact_factor: 1.8
scope_keywords:
  - aircraft systems
  - MDO
  - multidisciplinary design optimization
  - structural design
  - structural dynamics
  - flight mechanics
  - flight testing
  - applied CFD
  - aircraft aerodynamics
  - unsteady aerodynamics
  - aeroelasticity
  - aeroacoustics
  - propulsion-airframe integration
  - icing
  - UAV
  - STOL
  - VTOL
  - subsonic aircraft
  - supersonic aircraft
  - transonic aircraft
  - hypersonic aircraft
  - lighter-than-air
out_of_scope:
  - fundamental turbulence (without aircraft application)
  - spacecraft
  - pure propulsion (without airframe integration)
paper_types:
  - type: research_article
    word_count: {min: 5000, max: 12000}
  - type: technical_note
    word_count: {min: 2500, max: 3500}
  - type: design_forum
    word_count: {min: 3000, max: 8000}
typical_review_weeks: 12
acceptance_rate: 0.20
checklist_file: "checklists/journal_of_aircraft.yaml"
Aerospace Science and Technology (Elsevier)
YAML

id: aerospace_science_and_technology
name: "Aerospace Science and Technology"
publisher: "Elsevier"
issn_print: "1270-9638"
issn_online: "1626-3219"
impact_factor: 5.6
scope_keywords:
  - aeronautics
  - astronautics
  - propulsion
  - structures
  - flight mechanics
  - avionics
  - aircraft design
  - spacecraft design
review_type: single_blind
typical_review_weeks: 10
acceptance_rate: 0.28
citation_style: "elsevier_numbered"
latex_template: "elsarticle-2026"
ai_policy:
  disclosure_required: true
  authorship_prohibited: true
  template: "ai-disclosure/elsevier.md"
data_availability_required: true  # Elsevier requires data statement
checklist_file: "checklists/ast.yaml"
Progress in Aerospace Sciences (Elsevier — Survey Only)
YAML

id: progress_in_aerospace_sciences
name: "Progress in Aerospace Sciences"
publisher: "Elsevier"
issn_print: "0376-0421"
impact_factor: 8.3
scope_keywords:
  - comprehensive aerospace review
  - survey article
  - state of the art
  - aerospace technology overview
paper_types:
  - type: survey
    word_count: {min: 15000, max: 40000}
    description: "Comprehensive review articles ONLY. No research articles."
note: "This journal ONLY accepts survey/review papers. Research articles → desk reject."
typical_review_weeks: 20
acceptance_rate: 0.15
checklist_file: "checklists/progress_aerospace.yaml"
Acta Astronautica (Elsevier — Space Focus)
YAML

id: acta_astronautica
name: "Acta Astronautica"
publisher: "Elsevier / IAF"
impact_factor: 3.5
scope_keywords:
  - space science
  - spacecraft systems
  - launch vehicles
  - human spaceflight
  - space propulsion
  - satellite technology
  - orbital mechanics
  - space environment
note: "Aerospace propulsion for SPACE LAUNCH VEHICLES qualifies. 
       Air-breathing propulsion for aircraft does NOT qualify."
checklist_file: "checklists/acta_astronautica.yaml"
text


---

## 📄 File 14: `hooks/pre-tool-use/integrity-guard.ts`

```typescript
/**
 * AeroScribe PreToolUse Hook: Integrity Guard
 * Spec: GLOBAL-ARCH-001, RULE-040, RULE-041
 *
 * Runs before EVERY tool call. Blocks operations that would
 * violate the AeroScribe integrity model.
 */

import { PreToolUseHook, ToolCall, HookResult } from '@aeroscribe/shared';
import { logger } from '@aeroscribe/shared/logger';
import { VerifiedRegistry } from '@aeroscribe/verified-registry';

// Patterns that indicate secrets — block writes containing these
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,             // Anthropic API key
  /ghp_[A-Za-z0-9]{36}/,             // GitHub personal access token
  /AKIA[A-Z0-9]{16}/,                 // AWS access key
  /Bearer [A-Za-z0-9._-]{20,}/,      // Bearer token
  /password\s*=\s*['"]\S+['"]/i,     // Hardcoded password
  /api[_-]?key\s*=\s*['"]\S+['"]/i,  // Hardcoded API key
];

// Files that must NEVER be modified by agents
const PROTECTED_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.env',
  '.env.production',
  'packages/verified-registry/src/schema.ts',
  'packages/verified-registry/src/migrations/',
];

// CFD result files that must go through VerifiedRegistry
const CFD_OUTPUT_PATTERNS = [
  /surface_.*\.csv$/,
  /history_.*\.csv$/,
  /volume_.*\.vtu$/,
  /postProcessing\//,
];

export const integrityGuardHook: PreToolUseHook = async (
  toolCall: ToolCall,
  context: HookContext
): Promise<HookResult> => {

  // ── RULE-040: Block writes with secret patterns ─────────────────────
  if (toolCall.tool === 'write_file' || toolCall.tool === 'str_replace_editor') {
    const content = toolCall.params.content ?? toolCall.params.new_str ?? '';
    const filePath = toolCall.params.path ?? toolCall.params.file ?? '';

    // Skip .env files (they're allowed to have secrets)
    if (!filePath.includes('.env')) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          logger.error({
            event: 'INTEGRITY_VIOLATION',
            rule: 'RULE-040',
            tool: toolCall.tool,
            pattern: pattern.toString(),
            run_id: context.run_id,
          });
          return {
            blocked: true,
            reason: `INTEGRITY VIOLATION (RULE-040): Write blocked — content contains secret pattern: ${pattern.toString()}. Use environment variables.`,
          };
        }
      }
    }

    // ── Block modifications to protected files ─────────────────────────
    for (const protectedFile of PROTECTED_FILES) {
      if (filePath.includes(protectedFile)) {
        logger.error({
          event: 'INTEGRITY_VIOLATION',
          rule: 'RULE-041',
          tool: toolCall.tool,
          file: filePath,
          run_id: context.run_id,
        });
        return {
          blocked: true,
          reason: `INTEGRITY VIOLATION: Cannot modify protected file: ${protectedFile}. This file requires Engineering Lead approval.`,
        };
      }
    }
  }

  // ── RULE-041: CFD outputs must go through VerifiedRegistry ──────────
  if (toolCall.tool === 'read_file') {
    const filePath = toolCall.params.path ?? '';
    const isCFDOutput = CFD_OUTPUT_PATTERNS.some(p => p.test(filePath));

    if (isCFDOutput) {
      const isRegistered = await VerifiedRegistry.isFileRegistered(filePath, context.run_id);
      if (!isRegistered) {
        logger.error({
          event: 'INTEGRITY_VIOLATION',
          rule: 'RULE-041',
          tool: toolCall.tool,
          file: filePath,
          run_id: context.run_id,
        });
        return {
          blocked: true,
          reason: `INTEGRITY VIOLATION (RULE-041): CFD output file "${filePath}" has not been registered in VerifiedRegistry. Run the VerifiedRegistry.register() method on this file before reading it for manuscript use.`,
        };
      }
    }
  }

  // ── RULE-023: Block tool-call chains > 3 without reasoning ──────────
  if (context.consecutive_tool_calls_without_reasoning >= 3) {
    logger.warn({
      event: 'TOOL_CHAIN_WARNING',
      rule: 'RULE-023',
      count: context.consecutive_tool_calls_without_reasoning,
      run_id: context.run_id,
    });
    return {
      blocked: true,
      reason: `PIPELINE PAUSE (RULE-023): ${context.consecutive_tool_calls_without_reasoning} consecutive tool calls without a reasoning step. Please provide a reasoning step before continuing.`,
    };
  }

  // ── HITL Gate enforcement ────────────────────────────────────────────
  if (context.pending_gate && !context.gate_approved) {
    return {
      blocked: true,
      reason: `PIPELINE PAUSED: Gate ${context.pending_gate} requires researcher approval. POST /api/v1/pipeline/${context.run_id}/gates/${context.pending_gate}/approve`,
    };
  }

  return { blocked: false };
};
📄 File 15: hooks/post-tool-use/compression-loop.ts
TypeScript

/**
 * AeroScribe PostToolUse Hook: Compression Loop
 * Spec: GLOBAL-ARCH-001, RULE-021
 *
 * After every write operation, checks if the written code
 * can be compressed by 15% by reusing existing utilities.
 * Logs the Scout Report and compression opportunity.
 */

import { PostToolUseHook, ToolCall, HookResult } from '@aeroscribe/shared';
import { logger } from '@aeroscribe/shared/logger';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export const compressionLoopHook: PostToolUseHook = async (
  toolCall: ToolCall,
  result: ToolResult,
  context: HookContext
): Promise<HookResult> => {

  // Only run on file writes of TypeScript/Python files
  if (toolCall.tool !== 'write_file' && toolCall.tool !== 'str_replace_editor') {
    return { modified: false };
  }

  const filePath = toolCall.params.path ?? toolCall.params.file ?? '';
  if (!filePath.match(/\.(ts|tsx|py)$/)) {
    return { modified: false };
  }

  const content = toolCall.params.content ?? toolCall.params.new_str ?? '';
  const lineCount = content.split('\n').length;

  // Only compress files > 50 lines (not worth it for tiny files)
  if (lineCount < 50) {
    return { modified: false };
  }

  logger.info({
    event: 'COMPRESSION_LOOP_START',
    file: filePath,
    line_count_before: lineCount,
    run_id: context.run_id,
  });

  // Scout prompt — check for reusable utilities
  const scoutResponse = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_FAST!,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Search the @aeroscribe/shared package utilities and list any existing 
functions/utilities in packages/shared/src/ that could replace code in this file.
Be specific: list the utility name, its location, and which part of the new code it replaces.

New file: ${filePath}
Content:
\`\`\`
${content.substring(0, 3000)}
\`\`\`

Respond with JSON: { "reusable_utilities": [{"utility": "...", "location": "...", "replaces": "..."}] }
If no reusable utilities found, return: { "reusable_utilities": [] }`,
    }],
  });

  const scoutResult = JSON.parse(
    scoutResponse.content[0].type === 'text' ? scoutResponse.content[0].text : '{}'
  );

  logger.info({
    event: 'SCOUT_REPORT',
    file: filePath,
    reusable_utilities: scoutResult.reusable_utilities,
    run_id: context.run_id,
  });

  // If reusable utilities found, log them for agent awareness
  if (scoutResult.reusable_utilities?.length > 0) {
    return {
      modified: false,
      metadata: {
        scout_report: scoutResult.reusable_utilities,
        compression_opportunity: true,
        message: `⚠️ COMPRESSION OPPORTUNITY: Found ${scoutResult.reusable_utilities.length} existing utilities that could reduce this file. Consider refactoring before opening PR.`,
      },
    };
  }

  return { modified: false };
};
📄 File 16: Root turbo.json
JSON

{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:coverage": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "env": ["CI"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:migrate": {
      "cache": false
    },
    "db:generate": {
      "outputs": ["packages/shared/src/db/migrations/**"]
    }
  },
  "globalEnv": [
    "NODE_ENV",
    "ANTHROPIC_API_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "MINIO_ENDPOINT",
    "SEMANTIC_SCHOLAR_API_KEY",
    "CLERK_SECRET_KEY"
  ]
}
📄 File 17: specs/stage-2-novelty-detection/tasks.md (Example Tasks File)
Markdown

# Stage 2: Novelty Detection — Task Breakdown
# Spec ID: STAGE-2-TASKS-001
# Status: READY FOR IMPLEMENTATION
# Implements: STAGE-2-REQ-001

---

## TASK LIST

### TASK-201: Build Gap Matrix Engine
**Priority:** P0 (blocking)
**Estimated effort:** 2 days
**Assigned to:** AI Agent (Claude Code)
**Spec reference:** STAGE-2-REQ-001, FR-2-001

**Description:**
Implement the GapMatrixBuilder in packages/literature/src/gap-matrix/.
The gap matrix is a 3D sparse tensor: [phenomena × methodologies × parameter_ranges].
Empty cells = candidate research gaps.

**Input:**
```typescript
{
  literature_references: LiteratureReference[],  // From Stage 1
  domain_taxonomy: DomainTaxonomy,               // From journal-profiles
}
Output:

TypeScript

{
  gap_matrix: GapMatrix,           // 3D sparse representation
  candidate_gaps: ResearchGap[],   // Sorted by novelty potential
  visualization_data: object,       // D3-compatible for dashboard
}
Acceptance criteria:

 GapMatrix builds from ≥ 95 literature references
 ≥ 3 candidate gaps identified
 Each gap has: phenomena, missing_methodology, covered_parameter_ranges
 Unit tests cover: empty input, single paper, full corpus
 Test file: packages/literature/src/gap-matrix/tests/gap-matrix.test.ts
Scout prompt (run before implementing): "Search packages/shared/src/ and packages/literature/src/ for any existing sparse matrix utilities, taxonomy builders, or gap analysis helpers. List them before writing new code."

TASK-202: Implement Temporal Frontier Analysis
Priority: P0 (blocking) Estimated effort: 1 day Spec reference: STAGE-2-REQ-001, FR-2-002

Description: Plot chronological progress per subtopic. Identify where progress has stalled (no papers in last 24 months) or where a new method hasn't been applied to an old problem.

Input: LiteratureReference[] sorted by year Output: TemporalFrontier[] — subtopics with stall indicators

Acceptance criteria:

 Correctly identifies stalled subtopics (0 papers in 24 months)
 Identifies methodology gaps (new method X not applied to old problem Y)
 Returns sorted by "novelty opportunity score"
TASK-203: Contradiction Detection
Priority: P1 Estimated effort: 2 days Spec reference: STAGE-2-REQ-001, FR-2-003

Description: Use the citation graph from Stage 1 to find papers with contradicting conclusions about the same phenomenon. These are gold for novelty framing.

Algorithm:

For each pair of papers on the same topic cluster (cosine similarity ≥ 0.8)
Extract their primary claims using Claude claude-haiku-3-5
Compare claims using the ContradictionClassifier
Score: 1.0 = direct contradiction, 0.5 = partial conflict, 0.0 = consistent
Acceptance criteria:

 Correctly identifies ≥ 1 real contradiction in test corpus
 False positive rate < 20% on gold set
 Contradiction report includes: both papers, contradicting claims, score
TASK-204: Novelty Certificate Generator
Priority: P0 (blocking — required for GATE-2) Estimated effort: 1 day Spec reference: STAGE-2-REQ-001

Description: Synthesize gap matrix + temporal frontier + contradiction detection into the structured Novelty Certificate delivered at GATE-2.

Output schema:

TypeScript

interface NoveltyCertificate {
  proposed_contribution: string;     // From contribution_seed
  novelty_score: number;             // 0–10
  evidence_of_novelty: NoveltyClaim[];
  risk_assessment: {
    preprint_risk: "low" | "medium" | "high";
    competitor_groups: CompetingGroup[];
    estimated_timeline_pressure_weeks: number;
  };
  recommended_framing: string;       // "First application of X to Y..."
  contradictions_resolved: ContradictionPair[];
  gaps_filled: ResearchGap[];
}
Acceptance criteria:

 Score 8.0+ for genuinely novel topics (validated against gold set)
 Score < 4.0 for already-published work (validated against gold set)
 Recommended framing is specific and defensible
 Risk assessment includes competitor group publication rate
TASK-205: OpenNovelty Integration
Priority: P2 (nice-to-have for v1.0) Estimated effort: 3 days Spec reference: STAGE-2-REQ-001

Description: Integrate the OpenNovelty verification layer for additional cross-validation of the novelty claim against a broader paper corpus.

Acceptance criteria:

 OpenNovelty score correlated ≥ 0.7 with AeroScribe novelty score
 Discrepancies flagged and surfaced to researcher
 Timeout gracefully (OpenNovelty API unavailable → continue with internal score)
text


---

## 🗺️ Spec Completeness Map

| Spec File | Status | Gates | Priority |
|---|---|---|---|
| `CLAUDE.md` | ✅ Complete | — | P0 |
| `AGENTS.md` | ✅ Complete | — | P0 |
| `_global/architecture.md` | ✅ Complete | — | P0 |
| `_global/data-model.md` | ✅ Complete | — | P0 |
| `_global/api-contracts.md` | ✅ Complete | — | P0 |
| `_global/journal-profiles.md` | ✅ Complete | — | P0 |
| `stage-0/requirements.md` | ✅ Complete | GATE-0 | P0 |
| `stage-1/requirements.md` | ✅ Complete | GATE-1 | P0 |
| `stage-2/requirements.md` | ✅ Skeleton | GATE-2 | P0 |
| `stage-2/tasks.md` | ✅ Complete | — | P0 |
| `stage-3/requirements.md` | ✅ Skeleton | GATE-3 | P0 |
| `stage-4/requirements.md` | ✅ Complete | GATE-4A/B/C | P0 |
| `stage-5/requirements.md` | ✅ Complete | GATE-5 | P0 |
| `stage-6/requirements.md` | ✅ Complete | GATE-6 | P0 |
| `stage-7/requirements.md` | ✅ Complete | GATE-7 | P0 |
| `stage-8/requirements.md` | ✅ Complete | GATE-8 | P0 |
| `hooks/pre-tool-use/integrity-guard.ts` | ✅ Complete | — | P0 |
| `hooks/post-tool-use/compression-loop.ts` | ✅ Complete | — | P1 |
| `turbo.json` | ✅ Complete | — | P0 |

> Every spec file above follows the Altura model: **business context → functional requirements (DSL-style :::STRICT_REQUIREMENT::: blocks) → non-functional requirements → acceptance criteria (YAML test format) → gate payload schema**. The result is a complete, unambiguous implementation contract that any AI agent — Claude Code, Codex, Cursor — can execute against without guessing intent.





