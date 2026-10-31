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
      exclude: ['**/*.test.*', '**/data/**', '**/test/**'],
      // RULE-050 asks for real floors, not a report nobody reads. The numbers
      // below are a little under what the suite achieves today, so an honest
      // change passes and a regression that deletes tests does not.
      thresholds: {
        // The whole repository: UI components are exercised through behaviour
        // tests rather than every branch, so the floor is deliberately lower.
        global: { statements: 77, branches: 66, functions: 70, lines: 79 },
        // The service holds the integrity machinery: every stage handler, the
        // chain, the claim verifier. This is the part that must not rot.
        // Measured on the glob, which istanbul sums per matched file; the
        // per-directory line in the table is a slightly different aggregate, so
        // these floors carry a couple of points of headroom under it.
        'services/api/src/**': { statements: 90, branches: 78, functions: 89, lines: 92 },
      },
    },
  },
});
