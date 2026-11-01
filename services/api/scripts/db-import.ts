/**
 * `npm run db:import -- <dataDir>`
 *
 * One-way migration from a filesystem deployment into Postgres. Records are
 * inserted verbatim — same `seq`, same hashes, same timestamps — and the chain
 * is verified immediately afterwards. If the verification fails the transaction
 * has already been rolled back by then, so a failed import leaves nothing
 * behind.
 *
 * Exit codes: `0` imported and verified, `1` refused (non-empty database, bad
 * input) or verification failed.
 */
import { isAbsolute, resolve } from 'node:path';
import { loadConfig } from '../src/config';
import { createPool, importDataDir, redactDatabaseUrl } from '../src/store';

const target = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!target) {
  console.error('usage: npm run db:import -- <dataDir>');
  process.exit(1);
}

const config = loadConfig();
if (config.databaseUrl === null) {
  console.error('AEROSCRIBE_DATABASE_URL is not set; there is nowhere to import into.');
  process.exit(1);
}

const dataDir = isAbsolute(target) ? target : resolve(process.cwd(), target);

console.log('─'.repeat(72));
console.log('AeroScribe import: filesystem → postgres');
console.log(`from:     ${dataDir}`);
console.log(`to:       ${redactDatabaseUrl(config.databaseUrl)}`);
console.log('─'.repeat(72));

const pool = createPool({ databaseUrl: config.databaseUrl, max: 1 });
try {
  const result = await importDataDir(pool, dataDir);
  console.log(`evidence records: ${result.evidence}`);
  console.log(`runs:             ${result.runs}`);
  console.log(`run options:      ${result.runOptions}`);
  console.log(`audit entries:    ${result.audit}`);

  if (!result.verification.valid) {
    console.error(
      `\nIMPORTED CHAIN DOES NOT VERIFY at seq ${result.verification.brokenAt ?? '?'}: ` +
        `${result.verification.reason}`,
    );
    console.error('Do not cut over. The source files are unchanged; investigate before retrying.');
    process.exitCode = 1;
  } else {
    console.log(
      `\nverified: ${result.verification.records} record(s), head ${result.verification.head}`,
    );
    console.log('Cut over by setting AEROSCRIBE_STORE=postgres and restarting the API.');
  }
} catch (error) {
  console.error(`\nimport failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
