/**
 * `npm run db:verify`
 *
 * Re-verifies the whole evidence chain from outside the application, over a
 * dedicated connection. This is the tool an operator reaches for when a run
 * looks wrong: it does not consult the API, its cache or its in-memory index —
 * it reads the table and recomputes every hash.
 *
 * It also refuses to report a chain as valid if it cannot read it, which is the
 * difference between "no evidence of tampering" and "no evidence".
 *
 * Exit codes: `0` the chain verifies, `1` it does not (or the database is
 * unreachable). The message names the first broken sequence number.
 */
import { loadConfig } from '../src/config';
import { createStores, redactDatabaseUrl } from '../src/store';

const config = loadConfig();
if (config.databaseUrl === null) {
  console.error(
    'AEROSCRIBE_DATABASE_URL is not set. `db:verify` reads the Postgres chain; ' +
      'for a filesystem deployment, GET /api/v1/evidence/verify does the same walk.',
  );
  process.exit(1);
}

console.log('─'.repeat(72));
console.log('AeroScribe evidence verification');
console.log(`database: ${redactDatabaseUrl(config.databaseUrl)}`);
console.log('─'.repeat(72));

const stores = createStores({
  dataDir: config.dataDir,
  store: 'postgres',
  databaseUrl: config.databaseUrl,
});

try {
  const result = await stores.evidence.verify();
  if (result.valid) {
    console.log(`valid: ${result.records} record(s), head ${result.head}`);
  } else {
    console.error(`INVALID at seq ${result.brokenAt ?? '?'}: ${result.reason}`);
    console.error(
      'The chain is the submission gate. Do not publish anything produced after that record ' +
        'until the cause is known and recorded in the audit trail.',
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`could not verify: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await stores.close?.();
}
