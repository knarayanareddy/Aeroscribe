/**
 * Core domain types for the AeroScribe research pipeline.
 *
 * These types are the single source of truth shared by the dashboard UI, the
 * fixtures in `apps/dashboard/src/data`, and (in future) the agent backend.
 * Fields marked optional are not present in the current illustrative dataset.
 */

export type PipelineStatus = 'idle' | 'running' | 'gate_pending' | 'completed' | 'failed';

export type StageStatus =
  'pending' | 'running' | 'gate_pending' | 'completed' | 'failed' | 'skipped';

export interface StageInfo {
  id: number;
  name: string;
  shortName: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  /** Duration in minutes. */
  duration?: number;
  agentsActive: string[];
  /** Human-in-the-loop gate identifier, e.g. `GATE-2`. */
  gateId?: string;
  /** Sequence number of the evidence-registry record this stage produced. */
  evidenceSeq?: number;
  gateApproved?: boolean;
  /** Number of times a reviewer sent this stage back for revision. */
  revisionCount?: number;
  metrics?: Record<string, string | number>;
}

export interface PipelineRun {
  id: string;
  topic: string;
  journal: string;
  status: PipelineStatus;
  createdAt: string;
  updatedAt: string;
  /** Index of the stage that is currently executing. */
  currentStage: number;
  noveltyScore: number;
  paperTitle: string;
  stages: StageInfo[];
  /**
   * The OIDC subject that created the run, when the deployment has accounts.
   *
   * Absent for a run created in `none`/`token` mode and for every run stored
   * before accounts existed. Authorization treats "no owner" as "nobody's run":
   * only a reviewer or an admin may read it, because handing historical runs to
   * whoever logs in first would be a silent grant.
   */
  ownerSub?: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi: string;
  relevanceScore: number;
  citationCount: number;
  abstract: string;
  tags: string[];
  runId?: string;
}

export interface ResearchGap {
  id: string;
  phenomena: string;
  missingMethodology: string;
  noveltyScore: number;
  recommendation: string;
  competitorRisk: 'low' | 'medium' | 'high';
  runId?: string;
}

export interface CFDResult {
  id: string;
  name: string;
  value: number;
  unit: string;
  uncertainty: number;
  confidence: number;
  sha256: string;
  method: string;
  timestamp: string;
  runId?: string;
}

export interface AgentLog {
  id: string;
  agentId: string;
  stageId: string;
  runId: string;
  event: string;
  message: string;
  durationMs?: number;
  costUsd?: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface ReviewComment {
  id: string;
  reviewerId: string;
  reviewerName: string;
  section: string;
  severity: 'major' | 'minor' | 'suggestion';
  comment: string;
  resolved: boolean;
  response?: string;
  runId?: string;
}

export interface JournalProfile {
  id: string;
  name: string;
  publisher: string;
  impactFactor: number;
  acceptanceRate: number;
  reviewWeeks: number;
  scopeKeywords?: string[];
}

export interface WikiArticle {
  id: string;
  title: string;
  category: string;
  lastUpdated: string;
  papersLinked: number;
  status: 'published' | 'draft';
  summary?: string;
  relatedRunIds?: string[];
}

export interface ManuscriptSection {
  id: string;
  label: string;
  wordCount: number;
  status: 'complete' | 'in_review' | 'draft' | 'pending';
  content?: string;
  runId?: string;
}

export interface Contradiction {
  id: string;
  paperA: string;
  paperB: string;
  claimA: string;
  claimB: string;
  /** Normalised conflict score in [0, 1]. */
  score: number;
  topic: string;
}

export interface IntegrityRule {
  id: string;
  title: string;
  description: string;
  /** Where the rule is enforced today: `ui` (prototype), or `specified` only. */
  /**
   * Where the rule is actually enforced today:
   * - `api`      the service in `services/api` refuses to violate it;
   * - `ui`       only visible in this prototype's interface;
   * - `specified` written down in specs/integrity-rules.md, enforced nowhere yet.
   */
  enforcement: 'api' | 'ui' | 'specified';
}
