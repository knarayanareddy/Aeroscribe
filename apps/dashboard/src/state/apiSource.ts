import type { EvidenceRecord } from '@aeroscribe/contract';
import type { PipelineRun } from '@aeroscribe/pipeline';
import { createApiClient, type ApiClient } from '../api/client';
import type { RunSource } from './source';

/**
 * The live source.
 *
 * It is a thin translation layer and nothing else: every method exists so the
 * provider does not have to know an endpoint path, and no method invents a
 * value the API did not send. Errors propagate unchanged — the provider keeps
 * the message so the user reads the server's sentence, not a generic one.
 */
export function createApiSource(
  options: { baseUrl?: string; token?: string; fetch?: typeof fetch; client?: ApiClient } = {},
): RunSource {
  const client = options.client ?? createApiClient(options);
  const host = options.baseUrl && options.baseUrl.length > 0 ? options.baseUrl : 'this origin';

  return {
    mode: 'live',
    label: `Live API · ${host}`,

    async listRuns(): Promise<PipelineRun[]> {
      const { runs } = await client.listRuns();
      return runs;
    },
    async getRun(id) {
      return (await client.getRun(id)).run;
    },
    async createRun(input) {
      return (await client.createRun(input)).run;
    },
    async advance(id) {
      const result = await client.advance(id);
      return { run: result.run, evidenceSeq: result.evidenceSeq, blocked: result.blocked };
    },
    async approveGate(id, gateId, actor) {
      return (await client.approveGate(id, gateId, actor)).run;
    },
    async requestRevision(id, gateId, actor, note) {
      return (await client.requestRevision(id, gateId, actor, note)).run;
    },
    async evidence(id): Promise<EvidenceRecord[]> {
      return (await client.evidence(id)).records;
    },
    capabilities: () => client.capabilities(),
    audit: () => client.audit(),
    artefactUrl(runId, kind) {
      const base = client.baseUrl.endsWith('/') ? client.baseUrl.slice(0, -1) : client.baseUrl;
      return `${base}/api/v1/runs/${encodeURIComponent(runId)}/manuscript.${kind}`;
    },
  };
}
