import type { PipelineRun, StageInfo } from '@aeroscribe/pipeline';

/**
 * The wire contract between `services/api` and its clients.
 *
 * This package exists so the dashboard and the server cannot disagree about a
 * response shape without `tsc` failing. Two directions are guarded:
 *
 * - the server compiles against it — `services/api/src/agents/*` re-export these
 *   payload types, so a field renamed on the server breaks here first;
 * - the dashboard compiles against it, and `services/api/test/contract.test.ts`
 *   compares what the running server actually returns against what the client
 *   believes, using recorded fixtures the mapper tests read back.
 *
 * Rules for this file:
 *
 * - **No invented fields.** Everything here appears in a real response. A view
 *   that wants more must show less, not make it up.
 * - **`schemaVersion` is part of the contract.** A payload that changes shape
 *   bumps it, so a client can refuse to guess.
 * - No runtime code beyond the enums that the server and client both validate
 *   against; everything else is erased at build time.
 */

/* ───────────────────────────────── evidence ───────────────────────────────── */

/**
 * Evidence kinds, in the order the pipeline produces them.
 *
 * Single-sourced here because the server validates the `?kind=` query against
 * it and the dashboard builds filters from it; two copies would drift.
 */
export const EVIDENCE_KINDS = [
  'stage-output',
  'literature-search',
  'cfd-run',
  'novelty-report',
  'manuscript',
  'review-report',
  'compliance-report',
  'submission-package',
  'doi-recheck',
  'manuscript-render',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * One link in the hash chain.
 *
 * `hash` covers every field above it plus `prevHash`, so a record cannot be
 * edited without breaking verification. The payload is `unknown` on purpose:
 * narrowing it is the reader's job, and a payload that does not match its
 * stage's shape is a bug to surface, not to coerce.
 */
export interface EvidenceRecord<P = unknown> {
  seq: number;
  id: string;
  kind: EvidenceKind;
  runId: string;
  stageId: number | null;
  label: string;
  createdAt: string;
  payload: P;
  payloadHash: string;
  prevHash: string;
  hash: string;
}

export interface RegistryVerification {
  valid: boolean;
  records: number;
  head: string;
  /** First `seq` whose linkage or digest does not recompute, if any. */
  brokenAt?: number;
  reason?: string;
}

/* ─────────────────────────────── literature ──────────────────────────────── */

export type PaperSource = 'crossref' | 'arxiv' | 'semantic-scholar' | 'fixture';

export interface Paper {
  /** Stable id, `source:externalId`. */
  id: string;
  source: PaperSource;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citationCount: number | null;
  /**
   * Bibliographic fields a citation style needs. Optional because most
   * providers do not report all of them — Crossref carries volume and pages,
   * arXiv carries neither. `undefined` means "the provider did not report it",
   * which `toReferenceRecord` turns into an explicit `null`; it never means
   * "unknown, guess something plausible".
   */
  containerTitle?: string | null;
  volume?: string | null;
  pages?: string | null;
  publisher?: string | null;
  /** Proceedings/venue as the provider names it, when it names one at all. */
  venue?: string | null;
}

export interface DoiVerification {
  doi: string;
  normalised: string;
  verified: boolean;
  reason?: string;
  provider?: PaperSource;
  paper?: Paper;
  checkedAt: string;
  /**
   * Token overlap between the expected and returned title, in [0, 1]. Present
   * only when the caller supplied an expected title; it is the evidence behind
   * "this DOI is the paper you meant", not a confidence score.
   */
  titleSimilarity?: number | null;
  /**
   * The record a provider returned when the DOI resolved but the title did not
   * match the expected reference.
   *
   * Without this, a caller re-checking a stored manuscript could only tell
   * "resolves to the wrong paper" from "no longer resolves" by parsing the
   * reason string. The DOI *did* resolve — saying otherwise would be a lie — so
   * the resolved title travels with the failure.
   */
  candidate?: { title: string; similarity: number | null; provider: PaperSource };
}

export interface SearchReport {
  query: string;
  papers: Paper[];
  /** Providers that failed, with the reason. Never silently dropped. */
  errors: Array<{ provider: PaperSource; message: string }>;
  /**
   * True when the result came from the bundled fixture corpus instead of live
   * registries. Clients must show this: offline hits are illustrative only.
   */
  offline: boolean;
  executedAt: string;
}

export interface ReferenceVerification {
  /** ISO timestamp of the DOI resolution that admitted this record, or null. */
  verifiedAt: string | null;
  provider: PaperSource | null;
  /** Token overlap between the expected and returned titles, in [0, 1]. */
  titleSimilarity: number | null;
}

/**
 * A citation as data.
 *
 * Absent stays absent: a provider that does not report a volume yields `null`,
 * and nothing is derived from the DOI, the year or the title.
 */
export interface ReferenceRecord {
  /** Stable within a run, e.g. `ref-01`. */
  key: string;
  /** 1-based position in the manuscript's reference list. */
  index: number;
  doi: string | null;
  /**
   * Null only for records upgraded from the pre-structured format, where the
   * title existed solely inside a citation string. Consumers must render
   * "title not recorded" rather than recovering it from that string.
   */
  title: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  volume: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  verified: ReferenceVerification;
  /** True when this record was reconstructed from a v1 payload. */
  legacy?: boolean;
}

/* ──────────────────────────────── payloads ───────────────────────────────── */

export interface TopicPayload {
  stage: 'topic-intelligence';
  schemaVersion: 1;
  topic: string;
  requestedJournal: string;
  targetJournal: string;
  journalId: string;
  keywordFit: number;
  matchedKeywords: string[];
  unmatchedKeywords: string[];
  /** Numbers that are part of the research question itself. */
  topicNumbers: number[];
  generatedAt: string;
}

export interface VerifiedReference extends Paper {
  verified: boolean;
  verificationProvider?: string;
  verificationReason?: string;
  /**
   * 1-based position in the ranked search result this record came from.
   *
   * This is the only ordering signal the server has: ranking prefers records
   * with a resolvable DOI, then those with more citations. There is no 0–10
   * "relevance score" and the server does not invent one — a client that wants
   * to sort by relevance must sort by this rank or show nothing.
   */
  rank?: number;
}

export interface LiteraturePayload {
  stage: 'literature-archaeology';
  /** 2 = structured references; 1 (absent) = the pre-`ReferenceRecord` shape. */
  schemaVersion: 2;
  query: string;
  searchedAt: string;
  offline: boolean;
  papersFound: number;
  papersVerified: number;
  /**
   * Only DOI-verified records may be cited (RULE-002), so this list — not the
   * search results — is what the writer is allowed to reference.
   */
  references: ReferenceRecord[];
  /** The provider records behind `references`, kept for display. */
  papers: VerifiedReference[];
  rejected: Array<{ title: string; reason: string }>;
  providerErrors: Array<{ provider: string; message: string }>;
}

export interface NoveltyPayload {
  stage: 'novelty-detection';
  schemaVersion: 1;
  verifiedReferences: number;
  /** Topic terms that no verified abstract mentions. */
  uncoveredTerms: string[];
  coveredTerms: string[];
  gapCount: number;
  confidence: 'supported' | 'insufficient-evidence';
  notes: string[];
}

export interface FramingPayload {
  stage: 'contribution-framing';
  schemaVersion: 1;
  statement: string;
  journal: string;
  journalId: string;
  position: string;
  evidenceBasis: { verifiedReferences: number; gaps: number };
}

export interface GciLevel {
  level: string;
  cells: number;
  value: number;
}

export interface CfdEvidencePayload {
  stage: 'evidence-generation';
  schemaVersion: 1;
  quantity: string;
  unit: string;
  /** Which solver produced the numbers. `synthetic` is always labelled. */
  solver: 'su2' | 'synthetic';
  value: number;
  uncertainty: number;
  method: string;
  notes: string[];
  disclaimer?: string;
  gci: {
    levels: GciLevel[];
    apparentOrder: number;
    fineGciPercent: number | null;
    mediumGciPercent: number | null;
    asymptoticRatio: number | null;
    valid: boolean;
    reason?: string;
  } | null;
  artefacts: Array<{ name: string; sha256: string }>;
  computedAt: string;
}

export interface ManuscriptSectionText {
  heading: string;
  body: string;
}

export interface ManuscriptReference {
  index: number;
  /** Rendered for display; must be reproducible from `record` and the style. */
  citation: string;
  doi: string;
  /** The structured record this line was rendered from. */
  record: ReferenceRecord;
}

export interface ManuscriptPayload {
  stage: 'paper-synthesis';
  /** 2 = references carry their structured record. */
  schemaVersion: 2;
  title: string;
  journal: string;
  journalId: string;
  sections: ManuscriptSectionText[];
  abstract: string;
  wordCount: number;
  referenceCount: number;
  references: ManuscriptReference[];
  numbers: Record<string, number>;
  generatedAt: string;
  /** True when any number came from the synthetic solver. */
  synthetic: boolean;
}

export interface ReviewCommentRecord {
  id: string;
  section: string;
  severity: 'major' | 'minor';
  comment: string;
}

export interface ReviewPayload {
  stage: 'peer-review-council';
  schemaVersion: 1;
  manuscriptTitle: string;
  verdict: 'pass' | 'revise';
  comments: ReviewCommentRecord[];
  checks: Array<{ id: string; description: string; passed: boolean }>;
  reviewedAt: string;
}

export interface CompliancePayload {
  stage: 'revision-compliance';
  schemaVersion: 1;
  journal: string;
  journalId: string;
  compliant: boolean;
  wordCount: number;
  abstractWords: number;
  abstractWordLimit: number;
  missingSections: string[];
  issues: Array<{ rule: string; severity: 'major' | 'minor'; detail: string }>;
  checkedAt: string;
}

export interface WikiPayload {
  stage: 'aerowiki-submission';
  schemaVersion: 1;
  title: string;
  slug: string;
  markdown: string;
  relatedRunIds: string[];
  generatedAt: string;
}

export interface SubmissionPayload {
  stage: 'aerowiki-submission';
  schemaVersion: 1;
  journal: string;
  status: 'ready' | 'blocked';
  blockers: string[];
  files: Array<{ name: string; sha256: string; bytes: number | null }>;
  note: string;
  packagedAt: string;
}

/**
 * Stage 8 writes the article and the manifest in one append.
 *
 * The version covers the envelope; each part carries its own so a reader can
 * track them independently.
 */
export interface SubmissionPackagePayload {
  schemaVersion: 1;
  wiki: WikiPayload;
  submission: SubmissionPayload;
}

/**
 * One text artefact the renderer wrote, with the hash the registry can check.
 *
 * These live next to the PDF in the run's manuscript directory; the record is
 * the index, so a download route never has to guess a filename.
 */
export interface RenderedTextFile {
  name: string;
  sha256: string;
  bytes: number;
}

/**
 * The typeset manuscript, as stage 8 rendered it.
 *
 * `typeset` is the honest summary: `pdf` only when a TeX toolchain was present
 * and produced a file. `source-only` is a legitimate outcome that still ships a
 * compilable `.tex` — and still blocks submission, because a journal asked for a
 * PDF. Nothing in this payload is inferred: a missing PDF is `null`, not a
 * placeholder.
 */
export interface ManuscriptRenderPayload {
  stage: 'manuscript-render';
  schemaVersion: 1;
  runId: string;
  /** The journal the manuscript was formatted for. */
  journal: string;
  /** Which preamble the renderer used, e.g. `aiaa-style`. */
  template: string;
  /** The source's own generation time, so re-rendering is byte-identical. */
  generatedAt: string;
  files: RenderedTextFile[];
  texSha256: string;
  pdf: { sha256: string; bytes: number } | null;
  typeset: 'pdf' | 'source-only';
  toolchain: { binary: string; version: string | null } | null;
  /** Reference fields the `.bib` had to omit, because the record had none. */
  missingBibliographyFields: string[];
}

/* ──────────────────────────── reference re-checks ────────────────────────── */

/**
 * The standing of one stored reference at the moment it was re-checked.
 *
 * `fresh` and `stale` both mean the DOI resolved *now*; they differ in how old
 * the verification recorded in the manuscript was. `broken` and `mismatch` mean
 * it did not resolve to the expected paper — a rule violation, not a warning.
 * `unverified` means no check was possible (offline, no DOI, invalid syntax) and
 * is never reported as verified.
 */
export type RecheckStatus = 'fresh' | 'stale' | 'broken' | 'mismatch' | 'unverified';

export interface RecheckResult {
  /** The record's stable key, e.g. `ref-01`. */
  key: string;
  doi: string | null;
  title: string | null;
  status: RecheckStatus;
  /** Why, in the reader's words. Present for everything except a plain `fresh`. */
  reason: string | null;
  provider: PaperSource | null;
  titleSimilarity: number | null;
  /** The manuscript's own generation-time verification, echoed unchanged. */
  previousVerifiedAt: string | null;
}

export interface DoiRecheckSummary {
  fresh: number;
  stale: number;
  broken: number;
  mismatch: number;
  unverified: number;
  /** Every reference in the manuscript, including ones with no DOI. */
  total: number;
}

/**
 * One `doi-recheck` record: what every stored DOI did when it was re-resolved.
 *
 * The manuscript payload is never mutated by a re-check; this record is the new
 * fact, and the registry's chain is what makes "the manuscript has not changed
 * since" checkable.
 */
export interface DoiRecheckPayload {
  stage: 'reference-recheck';
  schemaVersion: 1;
  runId: string;
  checkedAt: string;
  offline: boolean;
  /** The staleness limit that was applied, in days. */
  maxAgeDays: number;
  results: RecheckResult[];
  summary: DoiRecheckSummary;
}

/** Overall standing of a run's references, by decreasing severity. */
export type ReferenceStanding = 'unchecked' | 'attention' | 'unverified' | 'stale' | 'current';

export interface ReferenceStatusEntry {
  key: string;
  index: number;
  doi: string | null;
  title: string | null;
  /** What the manuscript rendered as the citation line. Not re-derived. */
  citation: string;
  /** The generation-time verification stored on the record, unchanged. */
  verifiedAt: string | null;
  verifiedProvider: PaperSource | null;
  /** Null when this run has never been re-checked. */
  latest: {
    status: RecheckStatus;
    checkedAt: string;
    reason: string | null;
    provider: PaperSource | null;
    titleSimilarity: number | null;
    seq: number;
  } | null;
}

export interface ReferenceStatusResponse {
  runId: string;
  references: ReferenceStatusEntry[];
  /** When the newest re-check ran, or null if there is none. */
  checkedAt: string | null;
  /** How many `doi-recheck` records this run has. */
  rechecks: number;
  status: ReferenceStanding;
}

/* ─────────────────────────────── verification ────────────────────────────── */

export interface UnbackedClaim {
  token: string;
  value: number;
  context: string;
  reason: string;
}

export interface ClaimReport {
  ok: boolean;
  checked: number;
  unbacked: UnbackedClaim[];
  allowedDois: string[];
  observedDois: string[];
}

export type AuditAction =
  | 'run.created'
  | 'run.advanced'
  | 'stage.blocked'
  | 'gate.approved'
  | 'gate.rejected'
  | 'evidence.appended'
  | 'registry.verified'
  | 'literature.searched'
  | 'doi.verified'
  | 'doi.rechecked'
  | 'cfd.executed'
  | 'unauthorised';

export interface AuditEntry {
  at: string;
  action: AuditAction;
  runId: string | null;
  actor: string;
  detail?: Record<string, unknown>;
}

/* ──────────────────────────────── capabilities ───────────────────────────── */

export interface Su2Capability {
  configured: boolean;
  binary: string | null;
  available: boolean;
}

/**
 * Whether this instance can typeset a PDF.
 *
 * `configured` says the operator set `LATEX_BINARY`; `available` says the probe
 * actually got a version out of it. The two are separate facts: a path that does
 * not exist is configured but not available, and the UI must show that, not a
 * generic "not configured".
 */
export interface LatexCapability {
  configured: boolean;
  binary: string | null;
  available: boolean;
  /** First line of `<binary> --version`, when the probe answered. */
  version: string | null;
}

/**
 * What this instance can actually do.
 *
 * Every `false` here has to be visible in the UI. That is the point of the
 * endpoint: "not configured" is a fact the server reports, not a guess the
 * client makes from a failed request.
 */
export interface Capabilities {
  literature: {
    mode: 'live' | 'offline';
    crossref: boolean;
    arxiv: boolean;
    semanticScholar: boolean;
  };
  cfd: {
    su2: Su2Capability;
    /** Deterministic placeholder physics, always available, always labelled. */
    synthetic: boolean;
  };
  latex: LatexCapability;
  registry: { algorithm: 'sha256'; path: string };
  auth: { required: boolean };
  storage: {
    /**
     * Which store adapter the server is using (`AEROSCRIBE_STORE`).
     *
     * `filesystem` keeps runs, the evidence chain and the audit trail in
     * `AEROSCRIBE_DATA_DIR`; `postgres` keeps them in the database at
     * `database`. Only `filesystem` is single-writer.
     */
    backend: 'filesystem' | 'postgres';
    /** Where the filesystem adapter writes; empty when it is not in use. */
    runsDir: string;
    auditPath: string;
    /** The database, with any password removed; `null` for `filesystem`. */
    database: string | null;
  };
}

/* ──────────────────────────────── envelopes ──────────────────────────────── */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  commit: string;
  logLevel: string;
  capabilities: Capabilities;
  authRequired: boolean;
}

export interface RunsResponse {
  runs: PipelineRun[];
}

export interface RunResponse {
  run: PipelineRun;
}

export interface AdvanceResponse {
  run: PipelineRun;
  stage: StageInfo;
  /** `null` when the stage was blocked and wrote no evidence. */
  evidenceSeq: number | null;
  blocked: { reason: string } | null;
}

export interface EvidenceResponse {
  records: EvidenceRecord[];
}

export interface AuditResponse {
  entries: AuditEntry[];
  /** Lines that could not be parsed; surfaced rather than skipped. */
  malformed: number;
}

/* ──────────────────────────────── requests ───────────────────────────────── */

export interface CreateRunRequest {
  topic: string;
  journal?: string;
  researcher?: string;
  options?: {
    paperLimit?: number;
    verifyTop?: number;
    solver?: 'su2' | 'synthetic';
    quantity?: string;
    caseDescription?: string;
  };
}

export interface ActorRequest {
  actor?: string;
}

export interface RejectRequest {
  actor?: string;
  note?: string;
}

export interface VerifyDoiRequest {
  doi: string;
  expectedTitle?: string;
}

export interface VerifyClaimsRequest {
  text: string;
  runId: string;
}
