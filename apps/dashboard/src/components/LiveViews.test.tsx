import type {
  AuditResponse,
  Capabilities,
  EvidenceRecord,
  RunResponse,
} from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import auditFixture from '../api/__fixtures__/audit.json';
import capabilitiesFixture from '../api/__fixtures__/capabilities.json';
import evidenceFixture from '../api/__fixtures__/evidence.json';
import runFixture from '../api/__fixtures__/run.json';
import CFDLive from './CFDLive';
import DataModeBadge from './DataModeBadge';
import FixtureOnlyNotice from './FixtureOnlyNotice';
import LiteratureLive from './LiteratureLive';
import ManuscriptLive from './ManuscriptLive';
import NoveltyLive from './NoveltyLive';
import ReviewLive from './ReviewLive';
import WikiLive from './WikiLive';
import SettingsLive from './SettingsLive';
import { PipelineProvider } from '../state/PipelineProvider';
import type { RunSource } from '../state/source';

/**
 * The live views, driven by a capture the API really produced.
 *
 * The payloads come from `apps/dashboard/src/api/__fixtures__`, which
 * `services/api/test/contract.test.ts` writes from a real nine-stage run. These
 * tests therefore fail if a view stops understanding what the server sends — the
 * failure mode that fixture-only tests cannot catch.
 */
const run = (runFixture as unknown as RunResponse).run as PipelineRun;
const records = (evidenceFixture as { records: EvidenceRecord[] }).records;

function liveSource(overrides: Partial<RunSource> = {}): RunSource {
  return {
    mode: 'live',
    label: 'Live API · http://api.test',
    listRuns: async () => [run],
    getRun: async () => run,
    createRun: async () => run,
    advance: async () => ({ run, evidenceSeq: records.length, blocked: null }),
    approveGate: async () => run,
    requestRevision: async () => run,
    evidence: async () => records,
    capabilities: async () => capabilitiesFixture as Capabilities,
    audit: async () => auditFixture as AuditResponse,
    ...overrides,
  };
}

function renderLive(node: React.ReactNode, source: RunSource = liveSource()) {
  return render(<PipelineProvider source={source}>{node}</PipelineProvider>);
}

describe('LiteratureLive', () => {
  it('lists the run’s admitted references with their DOIs', async () => {
    renderLive(<LiteratureLive />);

    // The title appears in the list and again in the citation line, so match all.
    await waitFor(() =>
      expect(
        screen.getAllByText(/Transonic drag prediction on unstructured meshes/i).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getAllByText(/10\.2514\/1\.j060001/).length).toBeGreaterThan(0);
    // The API records no tags and no relevance score, so neither appears.
    expect(screen.queryByText(/tag/i)).toBeNull();
    expect(screen.queryByText(/relevance/i)).toBeNull();
  });

  it('says a run has no literature record instead of showing an empty table', async () => {
    renderLive(<LiteratureLive />, liveSource({ evidence: async () => [] }));
    await waitFor(() => expect(screen.getByTestId('literature-empty')).toBeVisible());
  });
});

describe('CFDLive', () => {
  it('shows the recorded value, the GCI study and the synthetic disclaimer', async () => {
    renderLive(<CFDLive />);

    await waitFor(() => expect(screen.getByTestId('cfd-synthetic-notice')).toBeVisible());
    expect(screen.getByText(/Synthetic result — not a simulation/i)).toBeVisible();
    expect(screen.getByText(/Mesh levels/i)).toBeVisible();
    expect(screen.getByText(/Artefacts \(SHA-256\)/i)).toBeVisible();
  });

  it('shows nothing when the run has no cfd-run record', async () => {
    renderLive(<CFDLive />, liveSource({ evidence: async () => [] }));
    await waitFor(() => expect(screen.getByTestId('cfd-empty')).toBeVisible());
  });
});

describe('SettingsLive', () => {
  it('reports the server’s capabilities rather than a placeholder', async () => {
    renderLive(<SettingsLive />);

    await waitFor(() => expect(screen.getByText(/Offline corpus/i)).toBeVisible());
    // Both optional toolchains are reported as missing, each with its own reason.
    await waitFor(() => expect(screen.getAllByText(/Not configured/i)).toHaveLength(2));
    expect(screen.getByText(/SU2_CFD_BINARY is unset/i)).toBeVisible();
    expect(screen.getByText(/LATEX_BINARY is unset/i)).toBeVisible();
    expect(screen.getByText(/AEROSCRIBE_API_KEY is unset/i)).toBeVisible();
    // The store backend is a capability too: a reader must be able to see that
    // this instance is single-writer before pointing a second replica at it.
    expect(screen.getByText(/AEROSCRIBE_STORE = filesystem/i)).toBeVisible();
    // ADR-0001: no model is called, and the screen says so.
    expect(screen.getByText('Not used')).toBeVisible();
  });

  it('opens the audit trail on request', async () => {
    renderLive(<SettingsLive />);

    await waitFor(() => expect(screen.getByText(/Audit trail/i)).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: /Show entries/i }));

    await waitFor(() => expect(screen.getAllByText('gate.approved').length).toBeGreaterThan(0));
  });

  it('says nothing can be reported when capabilities are missing', () => {
    render(
      <PipelineProvider source={liveSource({ capabilities: async () => null })}>
        <SettingsLive />
      </PipelineProvider>,
    );
    // The provider resolves capabilities asynchronously; the empty state is
    // rendered until (and unless) they arrive.
    expect(screen.getByText(/did not return capabilities/i)).toBeVisible();
  });
});

describe('NoveltyLive', () => {
  it('reports term coverage and refuses to score it', async () => {
    renderLive(<NoveltyLive />);

    await waitFor(() =>
      expect(screen.getByText(/Terms no verified abstract mentions/i)).toBeVisible(),
    );
    // The API records coverage only. The page text explains that no score is
    // computed; what must not exist is a numeric badge or a risk label.
    expect(screen.queryByText(/competitor risk/i)).toBeNull();
    expect(screen.queryByText(/^\d\.\d$/)).toBeNull();
  });

  it('says a run has no novelty record instead of fabricating gaps', async () => {
    renderLive(<NoveltyLive />, liveSource({ evidence: async () => [] }));
    await waitFor(() => expect(screen.getByTestId('novelty-empty')).toBeVisible());
  });
});

describe('ManuscriptLive', () => {
  it('renders the recorded manuscript and flags a synthetic result', async () => {
    renderLive(<ManuscriptLive />);

    await waitFor(() => expect(screen.getByTestId('manuscript-synthetic-notice')).toBeVisible());
    // The heading, not the word: the plan's own architecture sentence mentions
    // the journal's abstract limit.
    expect(screen.getByRole('heading', { name: /^Abstract$/i })).toBeVisible();
    expect(screen.getByText(/Source files/i)).toBeVisible();

    // RULE-030 is observable: the plan record the text was rendered from is
    // shown, with its paragraph ids, intents and declared numbers.
    await waitFor(() => expect(screen.getByTestId('manuscript-plan')).toBeVisible());
    expect(screen.getByTestId('manuscript-plan')).toHaveTextContent(/written before the text/i);
    expect(screen.getByTestId('manuscript-plan')).toHaveTextContent(/p-results-1/);

    // The recorded run has a LaTeX source and no PDF: the panel says exactly
    // that, lists the files and offers no PDF link.
    await waitFor(() => expect(screen.getByTestId('manuscript-render')).toBeVisible());
    expect(screen.getByTestId('render-summary')).toHaveTextContent(/LaTeX source only/i);
    expect(screen.getByText('manuscript.tex')).toBeVisible();
    expect(screen.getByText('references.bib')).toBeVisible();
    expect(screen.queryByRole('link', { name: /manuscript\.pdf/i })).toBeNull();
  });

  it('links the PDF only when the record says one was typeset', async () => {
    const recorded = records.find((record) => record.kind === 'manuscript-render')!;
    const typeset: EvidenceRecord = {
      ...recorded,
      payload: {
        ...(recorded.payload as Record<string, unknown>),
        typeset: 'pdf',
        pdf: { sha256: 'f'.repeat(64), bytes: 2048 },
        toolchain: { binary: '/usr/bin/pdflatex', version: 'pdfTeX 3.141592653' },
      },
    };

    renderLive(<ManuscriptLive />, {
      ...liveSource({ evidence: async () => [...records.filter((r) => r !== recorded), typeset] }),
      artefactUrl: (runId, kind) => `http://api.test/api/v1/runs/${runId}/manuscript.${kind}`,
    });

    await waitFor(() => expect(screen.getByTestId('render-summary')).toHaveTextContent(/PDF/i));
    const pdf = screen.getByRole('link', { name: /manuscript\.pdf/i });
    expect(pdf).toHaveAttribute('href', 'http://api.test/api/v1/runs/run-contract/manuscript.pdf');
    expect(screen.getByRole('link', { name: /manuscript\.tex/i })).toHaveAttribute(
      'href',
      'http://api.test/api/v1/runs/run-contract/manuscript.tex',
    );
  });

  it('says downloads are unavailable in fixture mode, and never invents a link', async () => {
    renderLive(<ManuscriptLive />);
    await waitFor(() => expect(screen.getByTestId('manuscript-render')).toBeVisible());
    expect(screen.queryByRole('link', { name: /manuscript\.(tex|pdf)/i })).toBeNull();
    expect(screen.getByText(/downloads are served by the API/i)).toBeVisible();
  });

  it('shows the sections the payload carries', async () => {
    renderLive(<ManuscriptLive />);
    await waitFor(() => expect(screen.getAllByText(/Sections/i).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('article').length).toBeGreaterThan(3);
  });

  it('says a run has no manuscript record', async () => {
    renderLive(<ManuscriptLive />, liveSource({ evidence: async () => [] }));
    await waitFor(() => expect(screen.getByTestId('manuscript-empty')).toBeVisible());
  });

  it('says the run has never been re-checked, without implying the DOIs are fresh', async () => {
    renderLive(<ManuscriptLive />);
    await waitFor(() => expect(screen.getByTestId('citation-checks-missing')).toBeVisible());
    expect(screen.getByTestId('citation-checks-missing')).toHaveTextContent(
      /Never re-checked in this run/i,
    );
  });

  it('shows the re-check verdict per reference when one exists', async () => {
    const recheck: EvidenceRecord = {
      ...records[0]!,
      seq: records.length,
      kind: 'doi-recheck',
      stageId: null,
      label: 'DOI re-check: 1 reference (1 fresh)',
      payload: {
        stage: 'reference-recheck',
        schemaVersion: 1,
        runId: run.id,
        checkedAt: '2026-10-31T22:10:00.000Z',
        offline: false,
        maxAgeDays: 30,
        summary: { fresh: 1, stale: 0, broken: 0, mismatch: 0, unverified: 0, total: 1 },
        results: [
          {
            key: 'ref-01',
            doi: '10.1016/j.jcp.2023.112001',
            title: 'Adjoint-based mesh adaptation for transonic flows',
            status: 'fresh',
            reason: null,
            provider: 'crossref',
            titleSimilarity: 1,
            previousVerifiedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    };

    renderLive(<ManuscriptLive />, liveSource({ evidence: async () => [...records, recheck] }));

    await waitFor(() => expect(screen.getByTestId('citation-checks')).toBeVisible());
    expect(screen.getByTestId('citation-checks-headline')).toHaveTextContent(
      /1 reference checked: 1 fresh, 0 stale, 0 unverified/,
    );
    expect(screen.getByText('fresh')).toBeVisible();
    expect(screen.getByText(/resolved to the stored paper/i)).toBeVisible();
  });
});

describe('ReviewLive', () => {
  it('shows the verdict and the failed checks, and offers no resolve button', async () => {
    renderLive(<ReviewLive />);

    await waitFor(() => expect(screen.getByText(/Verdict:/i)).toBeVisible());
    expect(screen.getByText(/Revise/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /resolve/i })).toBeNull();
    expect(screen.getByText(/not editable here/i)).toBeVisible();
  });

  it('says a run has no review record', async () => {
    renderLive(<ReviewLive />, liveSource({ evidence: async () => [] }));
    await waitFor(() => expect(screen.getByTestId('review-empty')).toBeVisible());
  });
});

describe('WikiLive', () => {
  it('renders the article from the submission package, read-only', async () => {
    renderLive(<WikiLive />);

    await waitFor(() =>
      expect(screen.getByText(/produce text the registry never hashed/i)).toBeVisible(),
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says a run has no wiki article', async () => {
    renderLive(<WikiLive />, liveSource({ evidence: async () => [] }));
    await waitFor(() => expect(screen.getByTestId('wiki-empty')).toBeVisible());
  });
});

describe('data-mode surfaces', () => {
  it('labels a live source with its host', async () => {
    render(
      <PipelineProvider source={liveSource()}>
        <DataModeBadge />
      </PipelineProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('Live API · http://api.test'),
    );
    expect(screen.getByTestId('data-mode-badge')).not.toHaveTextContent('illustrative');
  });

  it('explains why a fixture-only view is empty in live mode', () => {
    render(<FixtureOnlyNotice view="Novelty detection" />);

    const notice = screen.getByText(/not connected to the API yet/i);
    expect(notice).toBeVisible();
    const panel = notice.parentElement as HTMLElement;
    expect(within(panel).getByText(/Unset/i)).toBeVisible();
  });
});
