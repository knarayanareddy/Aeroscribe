/**
 * `npm run db:migrate`
 *
 * Applies every migration that has not run yet, in file-name order, and prints
 * what it did. Safe to run repeatedly and safe to run from a deploy hook: each
 * migration commits with its own row in `schema_migrations`, so the second run
 * is a no-op.
 *
 * Exit codes: `0` applied or already current, `1` the database refused.
 */
import { loadConfig } from '../src/config';
import { createPool, redactDatabaseUrl, runMigrations, storeError } from '../src/store';

const config = loadConfig();
if (config.databaseUrl === null) {
  console.error('AEROSCRIBE_DATABASE_URL is not set; there is no database to migrate.');
  process.exit(1);
}

const target = redactDatabaseUrl(config.databaseUrl);
console.log('─'.repeat(72));
console.log('AeroScribe migrations');
console.log(`database: ${target}`);
console.log('─'.repeat(72));

const pool = createPool({ databaseUrl: config.databaseUrl, max: 1 });
try {
  const result = await runMigrations(pool);
  for (const file of result.alreadyApplied) console.log(`  already applied  ${file}`);
  for (const file of result.applied) console.log(`  applied          ${file}`);
  console.log(
    result.applied.length === 0
      ? '\nnothing to do; the schema is current'
      : `\n${result.applied.length} migration(s) applied`,
  );
} catch (error) {
  const wrapped = storeError(error, config.databaseUrl);
  console.error(`\nmigration failed: ${(wrapped as Error).message}`);
  process.exit(1);
} finally {
  await pool.end();
}
