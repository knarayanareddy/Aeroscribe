import type {
  AuditResponse,
  Capabilities,
  EvidenceRecord,
  RunResponse,
} from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import auditFixture from '../api/__fixtures__/audit.json';
import capabilitiesFixture from '../api/__fixtures__/capabilities.json';
import evidenceFixture from '../api/__fixtures__/evidence.json';
import runFixture from '../api/__fixtures__/run.json';
import CFDLive from './CFDLive';
import DataModeBadge from './DataModeBadge';
import FixtureOnlyNotice from './FixtureOnlyNotice';
import LiteratureLive from './LiteratureLive';
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
    expect(screen.getByText(/Not configured/i)).toBeVisible();
    expect(screen.getByText(/AEROSCRIBE_API_KEY is unset/i)).toBeVisible();
    // ADR-0001: no model is called, and the screen says so.
    expect(screen.getByText('Not used')).toBeVisible();
  });

  it('opens the audit trail on request', async () => {
    renderLive(<SettingsLive />);

    await waitFor(() => expect(screen.getByText(/Audit trail/i)).toBeVisible());
    const button = screen.getByRole('button', { name: /Show entries/i });
    button.click();

    await waitFor(() => expect(screen.getByText('run.created')).toBeVisible());
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
