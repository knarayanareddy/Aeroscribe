export type PipelineStatus = 'idle' | 'running' | 'gate_pending' | 'completed' | 'failed';
export type StageStatus = 'pending' | 'running' | 'gate_pending' | 'completed' | 'failed' | 'skipped';

export interface PipelineRun {
  id: string;
  topic: string;
  journal: string;
  status: PipelineStatus;
  createdAt: string;
  updatedAt: string;
  currentStage: number;
  noveltyScore: number;
  paperTitle: string;
  stages: StageInfo[];
}

export interface StageInfo {
  id: number;
  name: string;
  shortName: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  agentsActive: string[];
  gateId?: string;
  gateApproved?: boolean;
  metrics?: Record<string, string | number>;
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
}

export interface ResearchGap {
  id: string;
  phenomena: string;
  missingMethodology: string;
  noveltyScore: number;
  recommendation: string;
  competitorRisk: 'low' | 'medium' | 'high';
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
}

// ── MOCK PIPELINE RUNS ───────────────────────────────────────────────────────
export const mockPipelineRuns: PipelineRun[] = [
  {
    id: 'run-001',
    topic: 'Rotating Detonation Engine Combustion Stability at High-Altitude Conditions',
    journal: 'Journal of Propulsion and Power',
    status: 'gate_pending',
    createdAt: '2026-04-28T09:00:00Z',
    updatedAt: '2026-04-28T14:32:00Z',
    currentStage: 2,
    noveltyScore: 8.7,
    paperTitle: 'Detonation Cell Instability in RDEs Under Simulated Stratospheric Conditions: A CFD-Validated Investigation',
    stages: [
      { id: 0, name: 'Topic Intelligence', shortName: 'Topic', status: 'completed', startedAt: '2026-04-28T09:00:00Z', completedAt: '2026-04-28T09:14:00Z', duration: 14, agentsActive: ['TopicIntelligenceAgent'], gateId: 'GATE-0', gateApproved: true, metrics: { journalFitScore: '9.1/10', targetJournal: 'J. Propulsion & Power', paperType: 'Research Article' } },
      { id: 1, name: 'Literature Archaeology', shortName: 'Literature', status: 'completed', startedAt: '2026-04-28T09:15:00Z', completedAt: '2026-04-28T11:45:00Z', duration: 150, agentsActive: ['LiteratureHarvestAgent', 'CitationGraphAgent', 'LiteratureRerankerAgent'], gateId: 'GATE-1', gateApproved: true, metrics: { papersHarvested: 147, papersReranked: 112, citationDepth: 3, doiVerified: '100%' } },
      { id: 2, name: 'Novelty Detection', shortName: 'Novelty', status: 'gate_pending', startedAt: '2026-04-28T11:46:00Z', completedAt: '2026-04-28T12:48:00Z', duration: 62, agentsActive: ['NoveltyDetectionAgent'], gateId: 'GATE-2', gateApproved: false, metrics: { noveltyScore: 8.7, gapsIdentified: 4, contradictionsFound: 2, preemptionRisk: 'Low' } },
      { id: 3, name: 'Contribution Framing', shortName: 'Framing', status: 'pending', agentsActive: [], metrics: {} },
      { id: 4, name: 'Evidence Generation (CFD)', shortName: 'CFD', status: 'pending', agentsActive: [], metrics: {} },
      { id: 5, name: 'Paper Synthesis', shortName: 'Writing', status: 'pending', agentsActive: [], metrics: {} },
      { id: 6, name: 'Peer Review Council', shortName: 'Review', status: 'pending', agentsActive: [], metrics: {} },
      { id: 7, name: 'Revision & Compliance', shortName: 'Revision', status: 'pending', agentsActive: [], metrics: {} },
      { id: 8, name: 'AeroWiki & Submission', shortName: 'Submit', status: 'pending', agentsActive: [], metrics: {} },
    ]
  },
  {
    id: 'run-002',
    topic: 'Adaptive Wing Morphing for Transonic Drag Reduction using SMA Actuators',
    journal: 'AIAA Journal',
    status: 'completed',
    createdAt: '2026-04-20T08:00:00Z',
    updatedAt: '2026-04-26T16:00:00Z',
    currentStage: 8,
    noveltyScore: 7.9,
    paperTitle: 'Variable Camber Wing via SMA Actuation: CFD Validation and Transonic Drag Polar Analysis',
    stages: [
      { id: 0, name: 'Topic Intelligence', shortName: 'Topic', status: 'completed', agentsActive: [], gateApproved: true, metrics: { journalFitScore: '8.4/10' } },
      { id: 1, name: 'Literature Archaeology', shortName: 'Literature', status: 'completed', agentsActive: [], gateApproved: true, metrics: { papersHarvested: 132 } },
      { id: 2, name: 'Novelty Detection', shortName: 'Novelty', status: 'completed', agentsActive: [], gateApproved: true, metrics: { noveltyScore: 7.9 } },
      { id: 3, name: 'Contribution Framing', shortName: 'Framing', status: 'completed', agentsActive: [], gateApproved: true, metrics: {} },
      { id: 4, name: 'Evidence Generation (CFD)', shortName: 'CFD', status: 'completed', agentsActive: [], gateApproved: true, metrics: { meshCells: '12.4M', solverIterations: 2400, convergenceResidual: '1e-6' } },
      { id: 5, name: 'Paper Synthesis', shortName: 'Writing', status: 'completed', agentsActive: [], gateApproved: true, metrics: { wordCount: 9840, figureCount: 12, referenceCount: 68 } },
      { id: 6, name: 'Peer Review Council', shortName: 'Review', status: 'completed', agentsActive: [], gateApproved: true, metrics: { majorComments: 3, minorComments: 8 } },
      { id: 7, name: 'Revision & Compliance', shortName: 'Revision', status: 'completed', agentsActive: [], gateApproved: true, metrics: { complianceScore: '98%' } },
      { id: 8, name: 'AeroWiki & Submission', shortName: 'Submit', status: 'completed', agentsActive: [], gateApproved: true, metrics: { submissionPackage: 'Ready', wikiArticles: 4 } },
    ]
  },
  {
    id: 'run-003',
    topic: 'Hypersonic Boundary Layer Transition on Blunt-Nosed Re-entry Vehicles',
    journal: 'Aerospace Science and Technology',
    status: 'running',
    createdAt: '2026-04-29T06:00:00Z',
    updatedAt: '2026-04-29T10:15:00Z',
    currentStage: 4,
    noveltyScore: 9.1,
    paperTitle: 'Mach 8 Boundary Layer Transition Onset: DNS Study with Wall-Temperature Sensitivity Analysis',
    stages: [
      { id: 0, name: 'Topic Intelligence', shortName: 'Topic', status: 'completed', agentsActive: [], gateApproved: true, metrics: {} },
      { id: 1, name: 'Literature Archaeology', shortName: 'Literature', status: 'completed', agentsActive: [], gateApproved: true, metrics: { papersHarvested: 189 } },
      { id: 2, name: 'Novelty Detection', shortName: 'Novelty', status: 'completed', agentsActive: [], gateApproved: true, metrics: { noveltyScore: 9.1 } },
      { id: 3, name: 'Contribution Framing', shortName: 'Framing', status: 'completed', agentsActive: [], gateApproved: true, metrics: {} },
      { id: 4, name: 'Evidence Generation (CFD)', shortName: 'CFD', status: 'running', agentsActive: ['CFDSetupAgent', 'CFDSolverAgent'], gateId: 'GATE-4A', metrics: { currentRefinement: 'Level 2/4', solverRuntime: '3h 22m', residual: '4.2e-4' } },
      { id: 5, name: 'Paper Synthesis', shortName: 'Writing', status: 'pending', agentsActive: [], metrics: {} },
      { id: 6, name: 'Peer Review Council', shortName: 'Review', status: 'pending', agentsActive: [], metrics: {} },
      { id: 7, name: 'Revision & Compliance', shortName: 'Revision', status: 'pending', agentsActive: [], metrics: {} },
      { id: 8, name: 'AeroWiki & Submission', shortName: 'Submit', status: 'pending', agentsActive: [], metrics: {} },
    ]
  }
];

// ── MOCK LITERATURE ──────────────────────────────────────────────────────────
export const mockPapers: Paper[] = [
  { id: 'p001', title: 'Detonation Cell Width in H₂-Air Mixtures at Elevated Pressures', authors: 'Smith, J.R. and Chen, W.', journal: 'Combustion and Flame', year: 2024, doi: '10.1016/j.combustflame.2024.01.012', relevanceScore: 9.4, citationCount: 23, abstract: 'This study investigates detonation cell width measurements in hydrogen-air mixtures over a pressure range of 1–20 atm using simultaneous schlieren photography and pressure diagnostics...', tags: ['detonation', 'hydrogen', 'cell width', 'high pressure'] },
  { id: 'p002', title: 'Rotating Detonation Engine Performance at Altitude Relight Conditions', authors: 'Nakamura, T., Voitsekhovskii, B., and Park, S.', journal: 'J. Propulsion and Power', year: 2023, doi: '10.2514/1.B39012', relevanceScore: 9.1, citationCount: 41, abstract: 'Altitude relight behavior of a rotating detonation engine combustor was characterized experimentally at simulated altitudes of 5–15 km using a vacuum facility...', tags: ['RDE', 'altitude', 'relight', 'combustor'] },
  { id: 'p003', title: 'CFD Simulation of Multi-Wave RDE with Reactant Injection Variation', authors: 'Liu, Y., Braun, J., and Yungster, S.', journal: 'AIAA Journal', year: 2024, doi: '10.2514/1.J063441', relevanceScore: 8.8, citationCount: 18, abstract: 'A high-fidelity CFD model of a rotating detonation engine is presented, accounting for multi-wave propagation modes and injector geometry...', tags: ['CFD', 'RDE', 'injection', 'simulation'] },
  { id: 'p004', title: 'Detonation Stability Analysis Using Linear Perturbation Theory', authors: 'Ng, H.D. and Zhang, F.', journal: 'Progress in Aerospace Sciences', year: 2022, doi: '10.1016/j.paerosci.2022.100887', relevanceScore: 8.5, citationCount: 62, abstract: 'Linear stability analysis of detonation waves is revisited using a refined activation energy model capable of predicting cellular structure onset...', tags: ['stability', 'linear perturbation', 'detonation', 'theory'] },
  { id: 'p005', title: 'Stratospheric Combustion Limits for Aviation Fuels', authors: 'Williams, F.A. and Dryer, F.L.', journal: 'Fuel', year: 2023, doi: '10.1016/j.fuel.2023.127540', relevanceScore: 8.2, citationCount: 29, abstract: 'The flammability and ignition limits of Jet-A and SAF blends at stratospheric pressure and temperature conditions are studied experimentally and computationally...', tags: ['stratospheric', 'aviation fuel', 'ignition', 'SAF'] },
  { id: 'p006', title: 'Effect of Ambient Pressure on Rotating Detonation Wave Speed', authors: 'Andrus, I.Q., King, P.I., and Schauer, F.R.', journal: 'J. Propulsion and Power', year: 2023, doi: '10.2514/1.B38877', relevanceScore: 8.0, citationCount: 35, abstract: 'The influence of ambient back-pressure on the propagation velocity and wave count of rotating detonations is studied parametrically in an annular combustor...', tags: ['RDE', 'pressure', 'wave speed', 'annular'] },
  { id: 'p007', title: 'High-Altitude Ignition of Hydrogen in Scramjet Intakes', authors: 'Turner, J.C., Smart, M.K., and Capra, B.', journal: 'Aerospace Science and Technology', year: 2022, doi: '10.1016/j.ast.2022.107580', relevanceScore: 7.6, citationCount: 44, abstract: 'The ignition of hydrogen fuel in a Mach 8 scramjet intake at 35 km altitude is studied via numerical simulation and shock-tunnel experiments...', tags: ['scramjet', 'hydrogen', 'high altitude', 'ignition'] },
  { id: 'p008', title: 'Thermodynamic Cycle Analysis of Pressure Gain Combustion Engines', authors: 'Kaemming, T.A. and Paxson, D.E.', journal: 'AIAA Journal', year: 2024, doi: '10.2514/1.J063810', relevanceScore: 7.3, citationCount: 12, abstract: 'A generalized thermodynamic framework for pressure-gain combustion engines is developed, encompassing PDEs, RDEs, and wave rotor combustors...', tags: ['thermodynamics', 'pressure gain', 'PDE', 'RDE', 'cycle analysis'] },
];

// ── MOCK RESEARCH GAPS ───────────────────────────────────────────────────────
export const mockResearchGaps: ResearchGap[] = [
  { id: 'gap-001', phenomena: 'RDE combustion stability at stratospheric pressure (<0.1 atm)', missingMethodology: 'High-fidelity reactive Euler CFD with detailed H₂-air kinetics', noveltyScore: 9.2, recommendation: 'First application of 3D DNS-validated RDE model to sub-100 mbar ambient conditions', competitorRisk: 'low' },
  { id: 'gap-002', phenomena: 'Detonation cell width at altitude-equivalent mixture fractions', missingMethodology: 'Combined experimental (shock tube) + numerical cell instability analysis', noveltyScore: 8.4, recommendation: 'Extend Ng & Zhang (2022) stability framework to low-pressure regimes', competitorRisk: 'medium' },
  { id: 'gap-003', phenomena: 'Multi-wave mode transitions under throttling at altitude', missingMethodology: 'Unsteady RANS with dynamic injector boundary conditions', noveltyScore: 7.8, recommendation: 'Parametric CFD study correlating wave count with altitude-equivalent back-pressure', competitorRisk: 'medium' },
  { id: 'gap-004', phenomena: 'Fuel-air mixing enhancement for cold, thin air at stratosphere', missingMethodology: 'LES with reduced-order turbulent mixing model', noveltyScore: 7.1, recommendation: 'Design space exploration for injector geometry at Mach 0.3 supply conditions', competitorRisk: 'high' },
];

// ── MOCK CFD RESULTS ──────────────────────────────────────────────────────────
export const mockCFDResults: CFDResult[] = [
  { id: 'cfd-001', name: 'Detonation Wave Speed', value: 1842.3, unit: 'm/s', uncertainty: 12.4, confidence: 95, sha256: 'a3f8c1d2e4b6...9f01', method: 'Reactive Euler, GRI-Mech 3.0', timestamp: '2026-04-29T08:44:00Z' },
  { id: 'cfd-002', name: 'Peak Pressure Ratio (p₂/p₁)', value: 18.6, unit: '—', uncertainty: 0.4, confidence: 95, sha256: 'b7e2a9c0f3d1...2a88', method: 'Reactive Euler, GRI-Mech 3.0', timestamp: '2026-04-29T08:44:00Z' },
  { id: 'cfd-003', name: 'Specific Impulse (Isp)', value: 4312, unit: 's', uncertainty: 38, confidence: 90, sha256: 'c1d4f8e0b2a7...5c33', method: 'Thermodynamic integration, GRI-Mech 3.0', timestamp: '2026-04-29T09:02:00Z' },
  { id: 'cfd-004', name: 'Combustion Efficiency (η_c)', value: 0.9417, unit: '—', uncertainty: 0.0031, confidence: 95, sha256: 'd9a3b0e7c2f1...8b12', method: 'Species integration over exit plane', timestamp: '2026-04-29T09:02:00Z' },
  { id: 'cfd-005', name: 'Cell Instability Parameter (χ)', value: 3.72, unit: '—', uncertainty: 0.18, confidence: 90, sha256: 'e5f2d1a8c9b0...4d77', method: 'Linear perturbation, Ng criterion', timestamp: '2026-04-29T09:15:00Z' },
];

// ── MOCK AGENT LOGS ───────────────────────────────────────────────────────────
export const mockAgentLogs: AgentLog[] = [
  { id: 'log-001', agentId: 'TopicIntelligenceAgent', stageId: 'stage-0', runId: 'run-001', event: 'STAGE_START', message: 'Beginning journal calibration for topic: Rotating Detonation Engine...', timestamp: '2026-04-28T09:00:12Z', level: 'info' },
  { id: 'log-002', agentId: 'TopicIntelligenceAgent', stageId: 'stage-0', runId: 'run-001', event: 'JOURNAL_MATCH', message: 'Journal of Propulsion and Power: scope fit score 9.1/10 (keywords: rotating detonation engines, combustion, turbomachinery). Acceptance rate 22%.', timestamp: '2026-04-28T09:08:44Z', level: 'success', durationMs: 512000, costUsd: 0.021 },
  { id: 'log-003', agentId: 'TopicIntelligenceAgent', stageId: 'stage-0', runId: 'run-001', event: 'GATE_REQUEST', message: 'GATE-0 triggered. Researcher approval required to proceed to Stage 1.', timestamp: '2026-04-28T09:13:55Z', level: 'warn' },
  { id: 'log-004', agentId: 'LiteratureHarvestAgent', stageId: 'stage-1', runId: 'run-001', event: 'HARVEST_START', message: 'Querying Semantic Scholar API for "rotating detonation engine altitude combustion stability". Rate limiting: 60 req/min.', timestamp: '2026-04-28T09:15:03Z', level: 'info' },
  { id: 'log-005', agentId: 'LiteratureHarvestAgent', stageId: 'stage-1', runId: 'run-001', event: 'HARVEST_COMPLETE', message: 'Harvested 147 papers (depth-3 citation expansion). All DOIs resolved and metadata verified. Zero hallucinated references.', timestamp: '2026-04-28T10:02:30Z', level: 'success', durationMs: 2840000, costUsd: 0.184 },
  { id: 'log-006', agentId: 'CitationGraphAgent', stageId: 'stage-1', runId: 'run-001', event: 'GRAPH_BUILD', message: 'Citation graph built: 147 nodes, 1,284 edges. Clustering identified 3 research sub-communities.', timestamp: '2026-04-28T10:45:00Z', level: 'success', durationMs: 2580000, costUsd: 0.097 },
  { id: 'log-007', agentId: 'LiteratureRerankerAgent', stageId: 'stage-1', runId: 'run-001', event: 'RERANK_COMPLETE', message: 'Reranked 147 → 112 papers by relevance (threshold: 7.0/10). Top paper: Nakamura et al. 2023 (score: 9.1).', timestamp: '2026-04-28T11:44:20Z', level: 'success', durationMs: 3560000, costUsd: 0.142 },
  { id: 'log-008', agentId: 'NoveltyDetectionAgent', stageId: 'stage-2', runId: 'run-001', event: 'GAP_MATRIX_BUILD', message: 'Gap matrix built: 12×8×6 tensor. 4 candidate research gaps identified. Primary gap: RDE stability at sub-100mbar conditions — zero papers found.', timestamp: '2026-04-28T12:22:10Z', level: 'success', durationMs: 2160000, costUsd: 0.209 },
  { id: 'log-009', agentId: 'NoveltyDetectionAgent', stageId: 'stage-2', runId: 'run-001', event: 'NOVELTY_CERTIFICATE', message: 'Novelty Certificate generated. Score: 8.7/10. Preemption risk: LOW (no arXiv preprints in last 90 days). Recommended framing: "First CFD-validated study of RDE combustion stability at stratospheric pressure conditions."', timestamp: '2026-04-28T12:47:55Z', level: 'success', durationMs: 1530000, costUsd: 0.118 },
  { id: 'log-010', agentId: 'NoveltyDetectionAgent', stageId: 'stage-2', runId: 'run-001', event: 'GATE_REQUEST', message: 'GATE-2 triggered. Novelty Certificate ready for researcher review.', timestamp: '2026-04-28T12:48:02Z', level: 'warn' },
];

// ── MOCK REVIEW COMMENTS ──────────────────────────────────────────────────────
export const mockReviewComments: ReviewComment[] = [
  { id: 'rc-001', reviewerId: 'ReviewerAAgent', reviewerName: 'Methodology Reviewer', section: 'Section 3 — CFD Setup', severity: 'major', comment: 'The grid convergence study (Richardson extrapolation) must be presented before any quantitative results are cited. Table 2 is referenced on p.8 but the GCI study appears only in the Appendix. Restructure to present convergence evidence first.', resolved: false },
  { id: 'rc-002', reviewerId: 'ReviewerBAgent', reviewerName: 'Literature Reviewer', section: 'Section 2 — Literature Review', severity: 'major', comment: 'Ng & Zhang (2022) is a critical reference for the stability analysis framework. The authors must engage with their linear perturbation formulation and explicitly state where their approach diverges or extends it.', resolved: false },
  { id: 'rc-003', reviewerId: 'ReviewerCAgent', reviewerName: 'Physics Reviewer', section: 'Section 4 — Results', severity: 'minor', comment: 'Figure 6 shows the detonation wave at t=0.2ms but the scale bar is missing. All schlieren-type images must include a length scale. Additionally, the colormap choice (jet) obscures the pressure discontinuity — recommend using a diverging colormap.', resolved: true, response: 'Scale bar added to Figure 6. Colormap changed to RdBu (diverging) for all pressure field visualizations. Revised figures uploaded to supplemental package.' },
  { id: 'rc-004', reviewerId: 'ReviewerDAgent', reviewerName: 'Compliance Reviewer', section: 'Abstract', severity: 'minor', comment: 'Abstract exceeds 250-word limit (current: 274 words). AIAA J. Propulsion and Power requires strict adherence to 250 words maximum. Condense Sentences 2–3 to reduce word count.', resolved: true, response: 'Abstract condensed to 248 words. Key quantitative result preserved.' },
  { id: 'rc-005', reviewerId: 'ReviewerAAgent', reviewerName: 'Methodology Reviewer', section: 'Section 3.2 — Kinetic Mechanism', severity: 'suggestion', comment: 'Consider including a sensitivity analysis of the kinetic mechanism choice (GRI-Mech 3.0 vs. San Diego mechanism). At low pressure conditions, the relative performance of mechanisms diverges significantly.', resolved: false },
  { id: 'rc-006', reviewerId: 'MetaReviewerAgent', reviewerName: 'Meta-Reviewer', section: 'Overall', severity: 'major', comment: 'The paper\'s central claim requires uncertainty quantification on ALL reported numerical values. Per RULE-031, every quantitative claim must follow the pattern: "[VALUE] ± [UNCERTAINTY] ([CONFIDENCE]%, [METHOD])". Currently 7 values in Section 4 lack uncertainty bounds.', resolved: false },
];

// ── JOURNAL PROFILES ─────────────────────────────────────────────────────────
export const journalProfiles = [
  { id: 'jpp', name: 'Journal of Propulsion and Power', publisher: 'AIAA', impactFactor: 2.3, acceptanceRate: 22, reviewWeeks: 14 },
  { id: 'aiaa', name: 'AIAA Journal', publisher: 'AIAA', impactFactor: 2.7, acceptanceRate: 20, reviewWeeks: 12 },
  { id: 'ast', name: 'Aerospace Science and Technology', publisher: 'Elsevier', impactFactor: 5.6, acceptanceRate: 28, reviewWeeks: 10 },
  { id: 'acta', name: 'Acta Astronautica', publisher: 'Elsevier / IAF', impactFactor: 3.5, acceptanceRate: 30, reviewWeeks: 11 },
  { id: 'pia', name: 'Progress in Aerospace Sciences', publisher: 'Elsevier', impactFactor: 8.3, acceptanceRate: 15, reviewWeeks: 20 },
  { id: 'joa', name: 'Journal of Aircraft', publisher: 'AIAA', impactFactor: 1.8, acceptanceRate: 20, reviewWeeks: 12 },
];

// ── AEROWIKI ARTICLES ─────────────────────────────────────────────────────────
export const mockWikiArticles = [
  { id: 'wiki-001', title: 'Rotating Detonation Engine (RDE)', category: 'Propulsion', lastUpdated: '2026-04-28', papersLinked: 23, status: 'published' },
  { id: 'wiki-002', title: 'Detonation Cell Width — Measurement Methods', category: 'Combustion', lastUpdated: '2026-04-27', papersLinked: 8, status: 'published' },
  { id: 'wiki-003', title: 'Pressure-Gain Combustion Cycles', category: 'Thermodynamics', lastUpdated: '2026-04-26', papersLinked: 12, status: 'published' },
  { id: 'wiki-004', title: 'Stratospheric Combustion Limits', category: 'Combustion', lastUpdated: '2026-04-28', papersLinked: 5, status: 'draft' },
  { id: 'wiki-005', title: 'SMA Actuated Morphing Wings', category: 'Structures', lastUpdated: '2026-04-24', papersLinked: 15, status: 'published' },
  { id: 'wiki-006', title: 'Transonic Drag Polar Analysis', category: 'Aerodynamics', lastUpdated: '2026-04-23', papersLinked: 19, status: 'published' },
];
