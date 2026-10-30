/**
 * Literature smoke test — run it against the live providers on purpose.
 *
 * ```bash
 * AEROSCRIBE_CONTACT_EMAIL=you@example.org npm run smoke:literature -- "transonic wing drag prediction"
 * npm run smoke:literature -- --offline "transonic wing drag prediction"
 * ```
 *
 * It prints what each provider returned, which hits resolved through a real DOI
 * registry, and which did not — with the reason. Nothing is written to disk and
 * nothing is cached: this is the command to run when someone asks "does the
 * literature integration actually work, or does it only work in tests?".
 *
 * Exit code is 0 when at least one DOI verified against a live registry (or when
 * running offline deliberately), and 1 otherwise, so it is usable in a
 * deployment check: a live run that reaches no registry fails loudly.
 */
import {
  ArxivClient,
  CrossrefClient,
  LiteratureService,
  SemanticScholarClient,
  type DoiVerification,
  type Paper,
} from '../src/literature';
import { loadConfig } from '../src/config';

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const query =
  args
    .filter((argument) => !argument.startsWith('--'))
    .join(' ')
    .trim() || 'transonic wing drag prediction';

const config = loadConfig(offline ? { ...process.env, AEROSCRIBE_OFFLINE: 'true' } : process.env);

const service = new LiteratureService({
  offline: config.offline,
  providers: [
    new CrossrefClient({ contactEmail: config.contactEmail }),
    new ArxivClient(),
    new SemanticScholarClient({
      apiKey: process.env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined,
    }),
  ],
  clock: () => new Date(),
  providerTimeoutMs: config.upstreamTimeoutMs,
});

function line(character = '─'): string {
  return character.repeat(72);
}

function describePaper(paper: Paper): string {
  const authors = paper.authors.slice(0, 2).join(', ') || 'unknown authors';
  return [
    `  ${paper.title}`,
    `  ${authors}${paper.year ? ` (${paper.year})` : ''} · ${paper.source}`,
    `  doi: ${paper.doi ?? 'none'}`,
  ].join('\n');
}

async function main(): Promise<number> {
  console.log(line());
  console.log(`AeroScribe literature smoke test`);
  console.log(`mode:      ${config.offline ? 'OFFLINE (fixture corpus)' : 'LIVE (network)'}`);
  console.log(`query:     ${query}`);
  console.log(`contact:   ${config.contactEmail || '(unset — Crossref polite pool not joined)'}`);
  console.log(line());

  const report = await service.search(query, { limit: 5 });

  console.log(`\nhits: ${report.papers.length}`);
  report.papers.forEach((paper, index) => {
    console.log(`\n[${index + 1}]\n${describePaper(paper)}`);
  });

  if (report.errors.length > 0) {
    console.log('\nprovider errors (these are reported, never hidden):');
    for (const error of report.errors) console.log(`  ${error.provider}: ${error.message}`);
  }

  const withDoi = report.papers.filter((paper) => paper.doi !== null);
  const verifications: DoiVerification[] = [];

  if (withDoi.length === 0) {
    console.log('\nNo hit carries a DOI, so none can be cited (RULE-002).');
  } else {
    console.log(`\n${line()}\nDOI verification (${withDoi.length} DOI(s)):\n`);

    for (const paper of withDoi) {
      const verification = await service.verifyDoi(paper.doi!, { expectedTitle: paper.title });
      verifications.push(verification);
      const status = verification.verified ? 'VERIFIED' : 'REJECTED';
      console.log(
        `  ${status.padEnd(8)} ${verification.normalised}` +
          (verification.provider ? ` via ${verification.provider}` : '') +
          (verification.reason ? ` — ${verification.reason}` : ''),
      );
    }
  }

  const verified = verifications.filter((verification) => verification.verified).length;
  console.log(`\n${line()}`);
  console.log(
    `summary: ${report.papers.length} hits, ${withDoi.length} with DOIs, ${verified} verified`,
  );
  if (config.offline) {
    console.log('offline mode: every hit is from the bundled fixture corpus and is NOT citable.');
  }
  console.log(line());

  // Offline can never verify a DOI by design, so it is not a failure.
  if (config.offline) return 0;
  return verified > 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
