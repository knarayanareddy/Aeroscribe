✈️📄 AeroScribe — The Autonomous Aerospace Research Paper Engine
From research topic to publication-ready manuscript, calibrated to AIAA, Journal of Aircraft, Journal of Propulsion and Power, Aerospace Science and Technology, and Acta Astronautica standards — fully autonomously.

🧬 Foundational Philosophy: What Makes This Different
The honest state of the art tells us something critical before we architect this. Current AI-generated research paper iterations produce promising drafts, but they fail to meet top-tier publication standards — particularly in critical analysis and originality.
1
 And from four real autonomous research attempts: we must not underestimate the acceleration through human-LLM collaboration — one physicist noted that such collaboration compressed a six-month workflow into six hours, a "factor of 1000" acceleration, effectively making him a "one-person army of experts."
2

AeroScribe is designed around this philosophy: not a replacement for the aerospace researcher, but a one-person-army multiplier — handling the literature archaeology, data synthesis, novelty detection, computational validation, and structured writing that consumes 80% of a researcher's time, while the human provides domain judgment, experimental insight, and final authority.

The key lesson from failed autonomous research pipelines: splitting all tasks into modular tasks prevents error cascading. One way to do this is to separate code generation from code execution, ensuring that verification hooks can be built in.
2
 AeroScribe is built on this modular principle end-to-end.

🏗️ System Architecture Overview
text

AeroScribe
│
├── STAGE 0: Topic Intelligence & Journal Targeting
├── STAGE 1: Deep Literature Archaeology
├── STAGE 2: Research Gap & Novelty Detection
├── STAGE 3: Hypothesis & Contribution Framing
├── STAGE 4: Computational Evidence Generation
├── STAGE 5: Paper Synthesis & Structured Writing
├── STAGE 6: Internal Peer Review Council
├── STAGE 7: Revision, Rebuttal & Journal Compliance
└── STAGE 8: Compounding AeroWiki + Institutional Memory
Every stage runs on the AeroScribe Agent Runtime — a fusion of:

Hermes Agent (persistent learning loop, skill creation, cross-session memory)
OpenClaw (multi-channel notifications — Slack, email, voice — to the researcher throughout)
Everything Claude Code (28 specialized subagents, 119 skills, PreToolUse/PostToolUse hooks)
AutoResearchClaw (the keep/revert experiment loop for computational evidence)
Academic Research Skills (Imbad0202/academic-research-skills) (integrity gates, compliance, reviewer calibration)
GitNexus (knowledge graph of the literature corpus — every paper, citation, concept, methodology)
LLM Wiki (compounding aerospace knowledge base that grows with every paper produced)
🎯 STAGE 0: Topic Intelligence & Journal Targeting
What It Does
The researcher provides a seed: a topic, a hypothesis, or even just a domain ("rotating detonation engines," "natural laminar flow airfoil optimization," "scramjet cavity flameholder stability"). AeroScribe's TopicIntelligenceAgent takes this seed and performs a full journal landscape analysis before a single paper is read.

The Journal Targeting System
AeroScribe ships with a built-in JournalProfileDB — a structured knowledge base of every major aerospace journal's scope, requirements, preferred methodology, typical paper structure, and editorial standards:

YAML

journals:
  AIAA_Journal:
    scope: "aeroacoustics, aerodynamics, combustion, fundamentals of propulsion,
            fluid mechanics and reacting flows, aerospace environment, structural
            mechanics and materials, thermomechanics"
    paper_types: [research_article, technical_note, design_forum, survey]
    note_length: "2500-3500 words"
    comment_max: "1200 words"
    style: "original archival, new theoretical developments AND experimental results"
    latex_template: "aiaa-aviation-2026"
    citation_style: "AIAA numeric"
    
  Journal_of_Propulsion_and_Power:
    scope: "airbreathing, electric, advanced propulsion; solid/liquid rockets;
            fuels/propellants; power generation/conversion; combustion;
            fluid mechanics; solid mechanics as related to propulsion"
    range: "fundamental research through development to applications"
    issn_online: "1533-3876"
    
  Journal_of_Aircraft:
    scope: "aircraft systems, MDO, structural design/dynamics, flight mechanics,
            applied CFD, aerodynamics (including unsteady), aeroelasticity,
            aeroacoustics, propulsion-airframe integration, flight testing,
            icing, wind shear, human factors, UAV, STOL/V-STOL"
    
  Aerospace_Science_and_Technology:
    scope: "Elsevier; aeronautics, astronautics, propulsion, structures,
            flight mechanics, avionics, design"
    impact_factor: 5.6
    
  Acta_Astronautica:
    scope: "IAF; space science and technology, spacecraft, launch vehicles,
            human spaceflight"
    
  Progress_in_Aerospace_Sciences:
    scope: "comprehensive review articles; survey papers preferred"
    article_type: review_only
The Journal of Propulsion and Power is devoted to the advancement of the science and technology of aerospace propulsion and power through the dissemination of original archival papers contributing to advancements in airbreathing, electric, and advanced propulsion — intended to provide readers with access to papers spanning the range from research through development to applications, covering combustion, fluid mechanics, and solid mechanics as directly related to propulsion and power.
3

The Journal of Aircraft publishes qualified papers on aircraft systems, multidisciplinary design optimization of aircraft, structural design/dynamics, active structural control, flight mechanics, flight and ground testing, measurement techniques, applied computational fluid dynamics, aircraft aerodynamics (including unsteady aerodynamics), aeroelasticity, aeroacoustics, and aircraft noise — covering general aviation, military and civilian aircraft, UAV, STOL and V/STOL, subsonic, supersonic, transonic, and hypersonic aircraft, and lighter-than-air systems.
4

Notes — approximately 2,500–3,500 words — are intended for prompt disclosures of new, significant data or developments of limited scope; Comments must not exceed 1,200 words and should relate to papers previously published by AIAA.
4

TopicIntelligenceAgent outputs:

JournalRankingMatrix — ranked list of best-fit journals for this topic with fit score, scope overlap percentage, and estimated acceptance probability
PaperTypeRecommendation — research article vs. technical note vs. survey vs. design forum
ScopeConstraintDocument — what the target journal explicitly wants vs. explicitly excludes
StructureTemplate — LaTeX skeleton with the exact section structure the target journal expects
KeywordCloud — 40+ candidate keywords for literature search seeding, organized by search engine compatibility
📚 STAGE 1: Deep Literature Archaeology
The Multi-Source Literature Ingestor
This is where AeroScribe earns its name. Agents automate the literature review process by synthesizing and analyzing existing research, identifying gaps, and guiding future directions — assisting in topic refinement, paper retrieval, and keyword generation to streamline literature research.
5

AeroScribe's LiteratureArchaeologyAgent simultaneously queries:

text

Primary Academic Sources:
├── NASA Technical Reports Server (NTRS) — 1M+ NASA documents
├── AIAA Aerospace Research Central (ARC) — full AIAA journal/conference archive
├── arXiv (cs.CE, physics.flu-dyn, eess.SY, cond-mat.mtrl-sci)
├── Semantic Scholar API — 200M+ papers with citation graph
├── Elsevier ScienceDirect — Aerospace Science & Technology, Acta Astronautica
├── Springer Aerospace — CEAS Aeronautical Journal, CEAS Space Journal
└── Web of Science / Scopus API — citation metrics, impact factors

Secondary/Grey Literature:
├── DLR Technical Reports (Germany)
├── ONERA Technical Notes (France)  
├── JAXA Research & Development Reports (Japan)
├── RAeS Aeronautical Journal archive
├── NATO STO (formerly RTO/AGARD) reports
├── NACA/NASA Technical Memoranda (historical, pre-1958)
└── US DOD DTIC (Defense Technical Information Center)

Real-time:
├── Firecrawl → live web fetch of journal ToC pages
├── Google Scholar alerts for new papers matching keywords
└── ResearchGate author pages for preprints
The RAG + Reranking Pipeline
The literature retrieval task is decomposed into two core components: a Retrieval Module that finds relevant papers and a Generation Module that synthesizes them — addressing a fundamental challenge in scientific writing: ensuring that LLM-generated text is factually accurate, relevant, and properly contextualized.
6

AeroScribe's retrieval is more sophisticated than a simple semantic search:

Round 1 — Broad harvest: 8 parallel keyword queries across all sources → 100+ candidate papers per query → 800+ raw candidates

Round 2 — LLM reranking: LLMs are used for ranking, where the LLM is passed a combined list of passages and prompted to rank them based on criteria — with only top-k candidates passed as input to the LLM for re-ranking.
7
 AeroScribe uses a debate-based reranker: two agents argue for and against each paper's relevance before a judge agent scores it. This combined approach of plan-based generation with debate-based re-ranking significantly improves the discovery of relevant papers.
6

Round 3 — Citation network expansion: GitNexus indexes the surviving paper set and traces their citation graphs — papers citing these papers, papers cited by these papers, and co-citation clusters. This surfaces seminal works the keyword search missed.

Round 4 — Quality scoring: Each paper gets scored on:

Relevance to target journal scope (0–10)
Citation count normalized by age
Journal impact factor
Methodological overlap with proposed contribution
Recency (2020–2026 weighted higher)
Output: The AeroScribe Reading List

Markdown

# AeroScribe Literature Report: [Topic]
# Target Journal: Journal of Propulsion and Power
# Generated: 2026-04-26

## Tier 1: Core References (Must Cite) — 24 papers
[Each entry: Title, Authors, Journal, Year, DOI, 
 Relevance Score, Why It Must Be Cited, 
 Key Finding Summary, Methodology Used,
 Gap It Leaves Open]

## Tier 2: Supporting References — 41 papers  
[Same structure, but supporting/contextual]

## Tier 3: Background/Foundational — 18 papers
[Seminal works establishing the field]

## Tier 4: Contrasting/Competing Approaches — 12 papers
[Papers whose conclusions the new work challenges or extends]

## Citation Network Map
[Mermaid diagram: which papers cite which, 
 who are the hub authors, which groups are active]

## Research Landscape Summary
[2-page synthesis: what has been established, 
 what is contested, what is unknown]
The GitNexus Knowledge Graph Layer
Every ingested paper is indexed in the AeroScribe Knowledge Graph:

Nodes: Papers, authors, institutions, methodologies, physical phenomena, design parameters, experimental facilities
Edges: "cites," "contradicts," "extends," "uses same method as," "studies same phenomenon as," "same author as"
Impact analysis: Before writing any claim, detect_impact checks: "does this claim have support from multiple independent sources, or only one?" Single-source claims get flagged for strengthening or qualification.
🔬 STAGE 2: Research Gap & Novelty Detection
The OpenNovelty Layer
An LLM-powered agentic system for verifiable scholarly novelty assessment — OpenNovelty — was introduced in January 2026.
8
 AeroScribe integrates this concept with aerospace-specific domain calibration.

The NoveltyDetectionAgent performs three analyses:

Analysis 1 — Gap Matrix: Constructs a matrix of: [Physical phenomena] × [Methodologies used to study them] × [Parameter ranges covered] × [Vehicle/engine types studied]. Empty cells in this matrix are candidate research gaps.

Analysis 2 — Temporal Frontier: For each subtopic, plots the chronological progression of the state of the art. Where has progress stalled? Where is a new methodology (e.g., PINN-based turbulence correction, ML-accelerated CFD) not yet been applied to an established problem?

Analysis 3 — Contradictions & Unresolved Debates: The Knowledge Graph surfaces papers that contradict each other. These are gold — a new paper that resolves a contested question with new evidence or a superior methodology is exactly what top journals want.

Output: Novelty Certificate

Markdown

## Proposed Contribution Novelty Assessment

**Claim:** "Application of physics-informed neural network turbulence 
correction to rotating detonation engine internal aerodynamics at 
off-design conditions"

**Novelty Score:** 8.7/10

**Evidence of Novelty:**
- PINN turbulence correction: applied to external aero (27 papers), 
  gas turbines (14 papers), NOT to RDE internal flows (0 papers)
- RDE aerodynamics at off-design: 6 papers, all using k-ω SST,
  none with PINN correction
- Gap: precisely the intersection of these two streams

**Risk Assessment:**
- Preprint risk: 3 recent arXiv submissions in adjacent space 
  (details: ...) — recommend 60-day fast-track timeline
- Competitor groups: TU Delft RDE group (Rein et al.), 
  Georgia Tech (Raman et al.) active in this space

**Recommended Framing:**
"First application of PINN-corrected turbulence modeling to 
RDE internal aerodynamics with experimental validation against 
Anand et al. (2024) test data"
💡 STAGE 3: Hypothesis & Contribution Framing
The Contribution Architecture Agent
The agents identify existing research problems and propose new solutions by generating novel algorithms, models, and techniques — also uncovering new research problems by analyzing literature and real-world needs, enabling the exploration of uncharted research areas.
5

The ContributionFramingAgent works with the researcher to crystallize the paper's exact contributions. AIAA journals expect papers to be explicit: "The contributions of this paper are..." AeroScribe generates a structured contribution statement that the researcher approves before any writing begins:

Markdown

## Contribution Statement Draft (for researcher approval)

**Primary Contribution:**
A physics-informed neural network (PINN) correction to the k-ω SST 
turbulence model, calibrated specifically for the high-curvature, 
high-rotation-rate flow field inside rotating detonation engine 
annular combustors, validated against three published experimental 
datasets spanning M = 0.4–1.2 and equivalence ratios φ = 0.8–1.3.

**Secondary Contributions:**
1. A new dimensionless parameter Γ_RDE characterizing the ratio of 
   detonation wave rotation to mean flow residence time, shown to 
   correlate with RANS model breakdown
2. A dataset of 847 PINN-corrected RANS solutions released as 
   open-source for community benchmarking
3. A correction framework generalizable to other rotating combustor 
   configurations (swirl combustors, trapped vortex combustors)

**What This Paper Does NOT Claim:**
- Does not address multi-phase injection effects
- Does not address acoustic-combustion coupling
- Validated only for hydrogen-air; hydrocarbon applicability TBD

**Target Journal:** Journal of Propulsion and Power
**Paper Type:** Research Article (~8,000–10,000 words)
**Estimated Impact:** Resolves the Rein et al./Anand et al. 
  discrepancy on fill fraction sensitivity (2 contested papers, 
  47 combined citations)

[RESEARCHER: Please confirm, modify, or redirect]
The researcher's response triggers the AutoResearchClaw loop: nothing is written until the research question is locked.

⚙️ STAGE 4: Computational Evidence Generation
The AeroLoop Integration
This is where AeroScribe departs most radically from general-purpose paper writers. A VerifiedRegistry enforces ground-truth experiment data in papers — auto-diagnosing failed experiments and repairing them before writing, with unverified numbers sanitized.
9
 AeroScribe goes further: it doesn't just verify — it generates the computational evidence using the autoresearch loop from our earlier AeroLoop and HyperProp designs.

The Evidence Generation Pipeline:

text

ComputationalEvidenceAgent
│
├── CFD/Simulation Jobs (autoresearch pattern)
│   ├── mutable_file: case_setup.py (OpenFOAM / SU2 / Eilmer4)
│   ├── metric: validation_error vs. target experimental dataset
│   ├── budget: 12-minute per solve, A100 GPU
│   └── keep/revert: git commit with residuals + force polars
│
├── Post-processing Agent
│   ├── Extracts: Cp distributions, Cf, L/D, thrust, Isp, NOx
│   ├── Generates: publication-quality matplotlib figures 
│   │   (AIAA style: 9pt Helvetica, 3.5" column width, 300 DPI)
│   └── Formats: tables in LaTeX tabular with booktabs
│
├── Statistical Validation Agent  
│   ├── Computes: RMSE, R², bias, uncertainty quantification
│   ├── Checks: grid convergence (Richardson extrapolation)
│   └── Generates: error bar plots with 95% confidence intervals
│
└── VerifiedRegistry
    ├── SHA256 checksums every result file
    ├── Links every number in the manuscript to its source file
    └── BLOCKS any claim not traceable to a verified computation
The Integrity Gate (from Academic Research Skills): A 7-mode AI Research Failure Mode Checklist blocks the pipeline at Stage 2.5/4.5 on suspected implementation bugs, hallucinated results, shortcut reliance, bug-as-insight, methodology fabrication, and frame-lock — extending an existing 5-type citation hallucination taxonomy.
10

No figure enters the manuscript unless its source data is version-controlled in git and its SHA256 checksum is logged in the VerifiedRegistry. This is the single most important integrity feature in the entire system.

The Human-in-the-Loop Gates (from AutoResearchClaw HITL): AutoResearchClaw v0.4.0 introduces a complete Human-in-the-Loop (HITL) system that transforms the pipeline from purely autonomous to a human-AI collaborative research engine.
9

At three points in Stage 4, the researcher must approve before the pipeline continues:

After grid convergence study — researcher validates the mesh independence conclusion
After validation against experiment — researcher confirms the error metrics are acceptable and physically meaningful
Before final figure set is locked — researcher approves the visual story the data tells
✍️ STAGE 5: Paper Synthesis & Structured Writing
The Hierarchical Writing Architecture
The Writer Agent automatically generates full-length academic papers by integrating research ideas, motivations, newly designed algorithm frameworks, and algorithm validation performance — leveraging a hierarchical writing approach to create polished manuscripts with precision and clarity.
11

AeroScribe writes in a strict hierarchy — from macro to micro — never writing a sentence before its containing paragraph is planned, never writing a paragraph before its containing section is structured:

text

Level 1: Paper Architecture (approved by researcher)
└── Level 2: Section Outlines (approved by researcher)
    └── Level 3: Paragraph Plans (citation-linked)
        └── Level 4: Sentence Generation (plan-guided)
            └── Level 5: LaTeX rendering + equation formatting
Why this works: Human evaluation results strongly favor plan-based approaches — plan-based generation receives higher rankings and produces fewer hallucinations, with combined plan-based generation with GPT-4 producing the highest quality literature reviews.
6

The AIAA LaTeX Engine
AeroScribe ships a complete AIAA-calibrated LaTeX engine:

LaTeX

% Auto-generated by AeroScribe v1.0
% Target: Journal of Propulsion and Power
% Template: aiaa-jpp-2026

\documentclass{aiaa-pretty}
\usepackage{amsmath, amssymb, physics}  % math
\usepackage{booktabs, multirow}          % tables
\usepackage{siunitx}                     % units (N, Pa, K, m/s)
\usepackage{cleveref}                    % smart cross-refs
\usepackage{algorithm2e}                 % pseudocode
\usepackage{tikz, pgfplots}             % figures (reproducible)

% AeroScribe VerifiedRegistry integration
\usepackage{aero-verified}  % custom package: \verifiedfig{sha256}{caption}
Every figure is rendered via pgfplots from raw data files — not image imports. This means:

Full reproducibility (data → figure is deterministic)
Resolution independence (vector graphics, not raster)
Style consistency (AIAA color palette, font sizes enforced by template)
Automatic caption generation with data provenance
Section-by-Section Writing Protocol
Abstract (250 words, AIAA standard): Four-sentence structure: (1) Problem statement + motivation, (2) Approach/methodology, (3) Key quantitative results, (4) Significance/broader impact. Written last, after all sections are finalized.

Nomenclature: Auto-generated from LaTeX source — every symbol used in equations is automatically cataloged with definition and units in SI.

Introduction: Built from the literature gap analysis. Structure:

Paragraph 1: Why this problem matters (with compelling statistics or failure-mode example)
Paragraphs 2–4: What has been done (literature synthesis from Stage 1)
Paragraph 5: What gap remains (from Stage 2 Novelty Certificate)
Paragraph 6: What this paper does, contribution statement (from Stage 3)
Paragraph 7: Paper roadmap ("Section II describes... Section III presents...")
Methodology: Written to be reproducible — another researcher with access to the same tools should be able to reproduce every result. The MethodologyAgent writes at a level of detail calibrated to the target journal's norms (extracted from the JournalProfileDB).

Results & Discussion: Every subsection follows: (1) What the figure/table shows, (2) Physical interpretation, (3) Comparison to literature/experiment, (4) Implication for the contribution claim. The DiscussionAgent specifically checks that every figure is explicitly discussed and every claim in the abstract is supported by a specific result.

Conclusions: Five-paragraph structure: (1) Problem restated, (2) Approach summary, (3) Key findings (numbered list, with specific numbers), (4) Limitations and scope, (5) Future work (specific, actionable).

References: For each generated reference, search keywords are extracted from its context and used to locate the original work via Google and arXiv — references that cannot be reliably verified are removed, ensuring the integrity of the bibliography.
12
 Every reference in AeroScribe is verified: DOI resolved, metadata confirmed, citation string validated against AIAA numeric format.

🧑‍⚖️ STAGE 6: Internal Peer Review Council
The Multi-Agent Review Panel
This is one of AeroScribe's most technically sophisticated components. Before the paper ever reaches a human reviewer, it passes through an internal council of adversarial AI reviewers — each calibrated to a different real reviewer archetype.

The Research Agent autonomously executes the research workflow encompassing literature retrieval, idea generation, experimental design, result analysis, and manuscript compilation. The Review Agent emulates the complete scholarly peer-review pipeline, including initial reviewer assessments, rebuttals, reviewer reassessments, meta-reviews, and final decisions.
12

text

AeroScribe Review Council
│
├── Reviewer A: "The Methodology Purist"
│   ├── Persona: Experimental aerodynamicist, 25 years experience
│   ├── Focus: Is the CFD methodology rigorous? Grid independence?
│   │          Uncertainty quantification? Validation vs. experiment?
│   └── Known bias: Skeptical of ML/PINN approaches without 
│                   extensive experimental validation
│
├── Reviewer B: "The Literature Expert"  
│   ├── Persona: Prolific author in the specific subfield
│   ├── Focus: Are all relevant papers cited? Is novelty overstated?
│   │          Is the related work section accurate and complete?
│   └── Known bias: Will check if their own papers are cited correctly
│
├── Reviewer C: "The Physical Reasoner"
│   ├── Persona: Theoretician, dimensional analysis focus
│   ├── Focus: Do the scaling laws make sense? Are the trends 
│   │          physically plausible? Are the conclusions supported 
│   │          by the data or overreached?
│   └── Known bias: Demands dimensional analysis and limiting cases
│
├── Reviewer D: "The Associate Editor"
│   ├── Persona: Journal AE for the target journal
│   ├── Focus: Scope fit, length, structure, abstract quality,
│   │          English language, AIAA format compliance
│   └── Known bias: Will desk-reject papers outside scope
│
└── Meta-Reviewer: "The Editor-in-Chief"
    ├── Reads all four reviews + author responses
    ├── Makes accept/major revision/minor revision/reject decision
    └── Provides overall assessment and priority concerns
The review agent emulates the complete scholarly peer-review pipeline, including initial reviewer assessments, rebuttals, reviewer reassessments, meta-reviews, and final decisions — exhibiting indicative ability for human paper acceptance and correlating well with human review scores.
12

The Reviewer Calibration Mode (from Academic Research Skills): Reviewer Calibration Mode — academic-paper-reviewer v1.8 — provides opt-in FNR/FPR/balanced-accuracy measurement against a user-supplied gold set, with 5× ensembling and cross-model default-on.
10
 AeroScribe's review council is calibrated against a gold set of 50 actual AIAA JPP accept/reject decisions with known outcomes — it measures its own review quality before applying it to new manuscripts.

The Compliance Agent: Pipeline guarantees: every stage requires user confirmation checkpoint; integrity verification at Stages 2.5 and 4.5 cannot be skipped; the Compliance Agent running PRISMA-trAIce + RAISE is added at Stages 2.5 and 4.5.
10

DIAGPaper Integration: DIAGPaper — diagnosing valid and specific weaknesses in scientific papers via multi-agent reasoning — was introduced in January 2026.
8
 AeroScribe incorporates this for systematic weakness detection before submission.

Review Output Format
Each reviewer produces a structured report:

Markdown

## Reviewer [A/B/C/D] Assessment

**Summary:** [2 sentences]
**Recommendation:** Accept / Major Revision / Minor Revision / Reject
**Confidence:** High / Medium / Low

**Major Concerns (must address):**
1. [Concern] → [Specific location in paper] → [Suggested resolution]
2. ...

**Minor Concerns (should address):**
1. [Concern] → [Specific location] → [Suggested resolution]
2. ...

**Specific Questions:**
1. "In Equation 7, the term Γ_RDE is defined but its derivation 
   is unclear. Please provide the full derivation or a reference."
2. ...

**Positive Aspects:**
- [What the paper does well]

**Format Compliance Issues:**
- [Specific AIAA format violations]
🔄 STAGE 7: Revision, Rebuttal & Journal Compliance
The Revision Engine
Once empirical results are obtained, the framework supports paper writing, self-evaluation, and rebuttal preparation, ensuring the manuscript meets academic standards and addresses peer review feedback.
5

The RevisionAgent takes the Review Council output and produces:

Response-to-Reviewers Document — standard academic format: each concern quoted verbatim, response provided, manuscript location of change indicated, diff shown
Revised Manuscript — all changes tracked in LaTeX with \changed{} commands for the editor
R&R Traceability Matrix — from Academic Research Skills: the R&R Traceability Matrix independently verifies author revision claims
10
 — every reviewer concern maps to a specific manuscript change, preventing the common failure mode of claiming to address a concern without actually doing so
The Rebuttal Writing Protocol:

Each reviewer concern is handled by a dedicated agent:

Technical concerns → ComputationalEvidenceAgent runs additional analysis if needed, then RevisionAgent writes the response
Literature concerns → LiteratureArchaeologyAgent does a fresh search on the specific subtopic, RevisionAgent cites the result
Scope/framing concerns → ContributionFramingAgent proposes reframing, researcher approves
Format concerns → LaTeXComplianceAgent automatically fixes
Journal-Specific Final Formatting
Before submission, the JournalComplianceAgent runs a complete pre-submission checklist against the target journal's author guidelines:

text

AIAA JPP Pre-Submission Checklist:
☑ Abstract ≤ 250 words (current: 247)
☑ Paper length within journal norms (current: 9,847 words)
☑ All figures at 300 DPI minimum (all: vector PDF, ∞ DPI)
☑ Figure captions complete and self-explanatory
☑ Nomenclature complete — all symbols defined
☑ Equations numbered consecutively
☑ References in AIAA numeric format
☑ DOIs verified for all references
☑ Author information anonymized for double-blind review
☑ Supplemental materials prepared (data files, code)
☑ AI usage statement prepared (venue-specific)
☑ Cover letter drafted
☑ Suggested reviewers list prepared (5 names, no conflicts)
☑ Manuscript compiled cleanly to PDF — no LaTeX errors
The Disclosure Mode — academic-paper v2.9 — is a venue-specific AI-usage statement generator, with v1 covering ICLR, NeurIPS, Nature, Science, ACL, and EMNLP.
10
 AeroScribe extends this with aerospace venue coverage: AIAA Journal, JPP, Journal of Aircraft, Aerospace Science & Technology, Acta Astronautica, and all AIAA conference proceedings.

🧠 STAGE 8: Compounding AeroWiki & Institutional Memory
The Living Knowledge Base
Every paper AeroScribe produces feeds back into the AeroWiki — the compounding knowledge base that makes every subsequent paper better than the last.

What gets added after each paper:

text

aero-wiki/
├── propulsion/
│   ├── rde-turbulence-modeling.md        ← from this paper
│   ├── rde-pinn-correction-results.md    ← quantitative findings
│   └── rde-open-questions.md             ← what wasn't answered
├── literature/
│   ├── rde-key-papers-2020-2026.md       ← curated, annotated
│   └── rde-contested-findings.md         ← unresolved debates
├── methodology/
│   ├── pinn-turbulence-correction.md     ← how we did it
│   └── rde-cfd-validation-protocol.md   ← what worked/didn't
└── journal-intelligence/
    ├── jpp-reviewer-preferences.md       ← what the council found
    └── jpp-accepted-paper-patterns.md    ← structural patterns
The Hermes Agent learning loop means AeroScribe gets genuinely better at targeting each journal over time — it learns the editorial preferences, the reviewer archetypes, the framing patterns that succeed, from every paper it produces.

Cross-paper synthesis: After 5+ papers in a domain, the SynthesisAgent compiles a "State of the Field" article — a survey paper synthesizing everything discovered across the research program. This is itself a publishable product in Progress in Aerospace Sciences or AIAA Journal.

🔗 Complete Technology Stack
text

AeroScribe Technology Stack
│
├── Agent Runtime
│   ├── Hermes Agent          — persistent memory, learning loop, skill creation
│   ├── OpenClaw              — multi-channel researcher notifications
│   ├── Everything Claude Code — 28 subagents, hooks, 119 skills
│   └── AutoResearchClaw      — idea → experiment → paper pipeline
│
├── Literature Layer
│   ├── LitLLM                — RAG-based literature review pipeline
│   ├── GitNexus              — citation knowledge graph
│   ├── LLM Wiki (all 4 variants) — compounding knowledge base
│   └── Semantic Scholar API  — 200M+ paper corpus
│
├── Writing Layer
│   ├── Academic Research Skills — integrity gates, reviewer calibration
│   ├── AI-Researcher (HKUDS)  — hierarchical writing architecture
│   ├── LLM-REVal             — review simulation and calibration
│   └── SHARP                  — paper reproduction/verification template
│
├── Computation Layer  
│   ├── AeroLoop              — CFD autoresearch loop
│   ├── HyperProp             — hypersonic computation agent
│   ├── PropGen               — propulsion cycle computation
│   └── TurbulenceWiki        — turbulence model validation harness
│
├── Quality Layer
│   ├── VerifiedRegistry       — SHA256 data provenance
│   ├── DIAGPaper             — weakness detection
│   ├── AgentShield (ECC)     — anti-hallucination hooks
│   └── PRISMA-trAIce         — systematic review compliance
│
└── Output Layer
    ├── AIAA LaTeX Engine      — journal-calibrated typesetting
    ├── pgfplots               — reproducible vector figures
    ├── Disclosure Generator   — venue-specific AI usage statements
    └── JournalComplianceAgent — pre-submission checklist
📊 End-to-End Pipeline Timeline
Stage	Duration	Human Touchpoints	Output
0 — Topic Intelligence	15 min	Topic seed input	Journal ranking, LaTeX skeleton
1 — Literature Archaeology	2–4 hours	Review reading list	95+ curated references + knowledge graph
2 — Novelty Detection	1 hour	Approve novelty cert	Novelty certificate + framing options
3 — Contribution Framing	30 min	Researcher approval required	Locked contribution statement
4 — Evidence Generation	8–48 hours	3 approval gates	Verified dataset, figures, tables
5 — Paper Writing	4–6 hours	Review section outlines	Draft manuscript LaTeX
6 — Internal Review	2 hours	Read review reports	4 reviewer reports + meta-review
7 — Revision	2–4 hours	Approve response-to-reviewers	Revised manuscript + rebuttal
8 — Compliance	30 min	Final approval	Submission-ready package
Total: 18–60 hours end-to-end vs. 3–18 months for traditional research workflows.

We must not underestimate the acceleration through human-LLM collaboration — such collaboration has compressed a six-month workflow into six hours — a "factor of 1000" acceleration — effectively making a researcher a "one-person army of experts."
2

⚠️ Integrity & Ethics Architecture
AeroScribe takes research integrity as seriously as any of its technical components. Five hard constraints that cannot be overridden:

No fabricated numbers. Every quantitative claim traces to a verified computation or a cited paper. The VerifiedRegistry physically prevents unverified numbers from appearing in the manuscript.

No hallucinated references. Every reference is DOI-resolved before it enters the bibliography. The 7-mode AI Research Failure Mode Checklist explicitly blocks the pipeline on suspected hallucinated results.
10

Transparent AI disclosure. Every submitted paper includes a venue-appropriate AI usage statement — not optional, not toggleable.

Researcher is always the author. AeroScribe is a tool. The human researcher who directed the research, approved the contributions, validated the computational results, and takes responsibility for the conclusions is the author. AeroScribe is acknowledged as a tool in the methods section, not listed as a co-author.

No scope gaming. The JournalComplianceAgent will not help frame a paper to fit a journal it doesn't genuinely fit. If the paper belongs in a different venue, the agent says so directly.

🏆 What AeroScribe Produces That Nothing Else Can
Capability	Generic AI Writers	AutoResearchClaw	AeroScribe
AIAA journal calibration	❌	❌	✅
Verified computational evidence	❌	Partial	✅
Citation knowledge graph	❌	❌	✅
Aerospace-specific reviewer council	❌	❌	✅
Multi-solver CFD integration	❌	❌	✅
Persistent AeroWiki memory	❌	❌	✅
R&R traceability matrix	❌	❌	✅
VerifiedRegistry data provenance	❌	Partial	✅
8+ journal profiles	❌	❌	✅
Human-in-the-loop gates	Partial	✅	✅
Self-improving over papers	❌	Partial	✅ (Hermes)
AeroScribe is, in essence, the world's first autonomous aerospace research laboratory — where the instruments are CFD solvers and the output is not data, but peer-reviewed knowledge.
