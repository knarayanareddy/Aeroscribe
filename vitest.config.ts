import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/**/src/**/*.test.{ts,tsx}',
      'apps/**/src/**/*.test.{ts,tsx}',
      'services/**/test/**/*.test.{ts,tsx}',
      'services/**/src/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**', 'services/*/src/**'],
      // `.sql` is here for the migrations: they are source, but the V8
      // provider tries to parse everything the include glob matches and would
      // fail on the first non-JavaScript file it met.
      exclude: ['**/*.test.*', '**/data/**', '**/test/**', '**/*.sql'],
      // RULE-050 asks for real floors, not a report nobody reads. The numbers
      // below are a little under what the suite achieves today, so an honest
      // change passes and a regression that deletes tests does not.
      thresholds: {
        // The whole repository: UI components are exercised through behaviour
        // tests rather than every branch, so the floor is deliberately lower.
        global: { statements: 78, branches: 67, functions: 72, lines: 80 },
        // The service holds the integrity machinery: every stage handler, the
        // chain, the claim verifier. This is the part that must not rot.
        // Measured on the glob, which istanbul sums per matched file; the
        // per-directory line in the table is a slightly different aggregate, so
        // these floors carry a couple of points of headroom under it.
        'services/api/src/**': { statements: 91, branches: 79, functions: 89, lines: 93 },
      },
    },
  },
});
