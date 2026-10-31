#!/usr/bin/env node
/**
 * Fail the build if a secret reached the browser.
 *
 * Two complementary checks, because "no secret" has two failure modes:
 *
 * 1. **A value leaked.** The built bundle is scanned for private keys, API
 *    tokens, and the literal value of every secret this process can see. If
 *    `AEROSCRIBE_API_KEY=sk-live-…` was in the environment when Vite built, that
 *    string had better not be in `dist/`.
 * 2. **A secret is *about* to leak.** Client source is scanned for
 *    `import.meta.env.X` where `X` is not `VITE_`-prefixed, and for `process.env`
 *    in browser code. Vite inlines `VITE_`-prefixed variables into the bundle,
 *    so the prefix is the whole boundary; anything else in client source is
 *    either dead code or a bug waiting for someone to add the `VITE_`.
 *
 * Displaying a *name* (the Settings screen lists variables the server reads) is
 * fine and is why a plain name search is not used: it would fail on
 * documentation and teach people to disable the check.
 *
 * Usage: node scripts/check-bundle-secrets.mjs [distDir...]
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BUNDLES = ['apps/dashboard/dist', 'apps/landing-page/dist'];
const CLIENT_SOURCE = ['apps/dashboard/src', 'apps/landing-page/src'];

const SECRET_VALUES = ['AEROSCRIBE_API_KEY', 'SEMANTIC_SCHOLAR_API_KEY', 'SU2_CFD_BINARY'];

/** Patterns whose presence in shipped JavaScript is always a defect. */
const FORBIDDEN_VALUES = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'a private key was bundled' },
  { pattern: /\bsk-[A-Za-z0-9]{16,}/, reason: 'this looks like a live API token' },
  { pattern: /\bghp_[A-Za-z0-9]{20,}/, reason: 'a GitHub token was bundled' },
];

/** Client code must only read `VITE_`-prefixed variables. */
const UNSAFE_ENV_READ = /(?:import\.meta\.env\.([A-Z0-9_]+)|process\.env\.([A-Z0-9_]+))/g;

const TEXT = /\.(js|mjs|css|html|json|svg)$/;
const SOURCE = /\.(ts|tsx|js|jsx)$/;

async function walk(directory, matcher) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, matcher)));
    else if (matcher.test(entry.name)) files.push(path);
  }
  return files;
}

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function scanBundles(findings) {
  let scanned = 0;
  for (const target of BUNDLES) {
    const directory = resolve(target);
    if (!(await exists(directory))) continue;

    for (const file of await walk(directory, TEXT)) {
      const text = await readFile(file, 'utf8');
      scanned += 1;

      for (const { pattern, reason } of FORBIDDEN_VALUES) {
        const match = text.match(pattern);
        if (match) findings.push({ where: file, what: match[0], reason });
      }

      for (const name of SECRET_VALUES) {
        const value = process.env[name];
        if (value && value.length >= 8 && text.includes(value)) {
          findings.push({
            where: file,
            what: `${name}'s value`,
            reason: `the build environment had ${name} set and its value is in the bundle`,
          });
        }
      }
    }
  }
  return scanned;
}

async function scanClientSource(findings) {
  let scanned = 0;
  for (const target of CLIENT_SOURCE) {
    const directory = resolve(target);
    if (!(await exists(directory))) continue;

    for (const file of await walk(directory, SOURCE)) {
      const text = await readFile(file, 'utf8');
      scanned += 1;

      for (const match of text.matchAll(UNSAFE_ENV_READ)) {
        const name = match[1] ?? match[2];
        if (!name) continue;
        // A `VITE_`-prefixed variable is public by definition. Anything else in
        // browser code is either dead or about to be inlined by accident.
        const allowed =
          name.startsWith('VITE_') || name === 'MODE' || name === 'DEV' || name === 'PROD';
        if (!allowed) {
          findings.push({
            where: file,
            what: name,
            reason:
              'client code reads a non-public environment variable; only VITE_-prefixed names may reach the browser',
          });
        }
      }
    }
  }
  return scanned;
}

const findings = [];
const bundleFiles = await scanBundles(findings);
const sourceFiles = await scanClientSource(findings);

if (findings.length > 0) {
  console.error(`[bundle-secrets] ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`  ${finding.where}: ${finding.what} — ${finding.reason}`);
  }
  console.error('[bundle-secrets] Secrets are read by the server. Keep them there.');
  process.exitCode = 1;
} else {
  console.log(
    `[bundle-secrets] ${bundleFiles} bundle file(s) and ${sourceFiles} client source file(s) scanned; nothing to report.`,
  );
}
