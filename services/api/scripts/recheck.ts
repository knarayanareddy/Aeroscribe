/**
 * DOI re-check CLI — the supported scheduling mechanism for RULE-002.
 *
 * ```bash
 * npm run recheck -- --run run-abc123
 * npm run recheck -- --all
 * ```
 *
 * There is no background timer in the service: a queue that fires when nobody is
 * watching is a thing you cannot test, cannot pause and cannot explain to an
 * auditor. A cron entry on the host runs this, and the evidence registry records
 * what it found.
 *
 * Exit codes:
 *   0 — every reference resolved to the paper it claims to be
 *   1 — at least one reference is broken or points at a different paper
 *   2 — the command could not run (bad arguments, unknown run, no manuscript)
 *
 * `stale` and `unverified` do not fail the run: stale means "resolves, but the
 * stored check is old", and unverified means the check could not be made (offline
 * mode, no DOI). Both are printed; neither is silently treated as a pass.
 */
import { loadConfig } from '../src/config';
import { LiteratureService } from '../src/literature';
import { CrossrefClient, SemanticScholarClient, ArxivClient } from '../src/literature';
import { recheckRun } from '../src/references/recheck';
import { createStores } from '../src/store';

interface Args {
  runId: string | null;
  all: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let runId: string | null = null;
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--run':
        runId = argv[++index] ?? null;
        break;
      case '--all':
        all = true;
        break;
      default:
        break;
    }
  }

  return { runId, all };
}

async function main(): Promise<number> {
  const config = loadConfig(process.env);
  const args = parseArgs(process.argv.slice(2));

  if (!args.runId && !args.all) {
    console.error('Usage: npm run recheck -- --run <run-id> | --all');
    return 2;
  }

  const literature = new LiteratureService({
    offline: config.offline,
    providers: config.offline
      ? []
      : [
          new CrossrefClient({
            contactEmail: config.contactEmail,
            baseDelayMs: config.retryBaseDelayMs,
            timeoutMs: config.upstreamTimeoutMs,
          }),
          new ArxivClient({
            baseDelayMs: config.retryBaseDelayMs,
            timeoutMs: config.upstreamTimeoutMs,
          }),
          new SemanticScholarClient({
            apiKey: process.env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined,
            baseDelayMs: config.retryBaseDelayMs,
            timeoutMs: config.upstreamTimeoutMs,
          }),
        ],
  });

  const stores = createStores({ dataDir: config.dataDir, store: config.store });
  const registry = stores.evidence;
  const runs = stores.runs;
  const audit = stores.audit;

  const targets = args.all ? (await runs.list()).map((run) => run.id) : [args.runId as string];

  console.log('─'.repeat(72));
  console.log('AeroScribe DOI re-check');
  console.log(`data:     ${config.dataDir}`);
  console.log(`mode:     ${config.offline ? 'offline (nothing can be verified)' : 'live'}`);
  console.log(`max age:  ${config.doiMaxAgeDays} days`);
  console.log(`targets:  ${targets.length}`);
  console.log('─'.repeat(72));

  let exitCode = 0;

  for (const runId of targets) {
    let outcome;
    try {
      outcome = await recheckRun(runId, {
        literature,
        registry,
        maxAgeDays: config.doiMaxAgeDays,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A run with no manuscript has nothing to check; with `--all` that is
      // ordinary (most runs never reach stage 5), so it is a note, not a failure.
      console.log(`\n${runId}: skipped — ${message}`);
      continue;
    }

    const { payload, record } = outcome;
    console.log(`\n${runId} — evidence seq ${record.seq}, checked ${payload.checkedAt}`);
    console.log(
      `  fresh ${payload.summary.fresh} · stale ${payload.summary.stale} · broken ${payload.summary.broken} · mismatch ${payload.summary.mismatch} · unverified ${payload.summary.unverified} (of ${payload.summary.total})`,
    );

    for (const result of payload.results) {
      const dot =
        result.status === 'fresh' || result.status === 'stale'
          ? '✓'
          : result.status === 'unverified'
            ? '·'
            : '✗';
      console.log(
        `  ${dot} ${result.key.padEnd(7)} ${String(result.doi ?? '(no DOI)').padEnd(24)} ${result.status}${result.reason ? ` — ${result.reason}` : ''}`,
      );
      if (result.status === 'broken' || result.status === 'mismatch') exitCode = 1;
    }

    await audit.record({
      action: 'doi.rechecked',
      runId,
      actor: 'cli',
      detail: { seq: record.seq, checkedAt: payload.checkedAt, ...payload.summary },
    });
  }

  console.log('─'.repeat(72));
  if (exitCode === 1) {
    console.error('At least one reference no longer resolves to the paper it claims to be.');
  }

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`\nRe-check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
