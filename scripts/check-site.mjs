#!/usr/bin/env node
/**
 * Fail the deploy if the assembled Pages site would serve a blank page.
 *
 * A GitHub Pages project site lives under `/Aeroscribe/`, so every absolute URL
 * in the built HTML has to start with that prefix *and* resolve to a file in the
 * artefact. Vite bakes `base` into those URLs, which makes the failure mode
 * quiet: a dashboard built with the landing page's base still looks fine in
 * `dist/`, and only 404s once it is published. That happened here — CI built the
 * dashboard with `BASE_PATH=/Aeroscribe/`, so `index.html` asked for
 * `/Aeroscribe/assets/…` while the file was copied to
 * `/Aeroscribe/dashboard/assets/…`.
 *
 * The checks are deliberately about the published layout, not about Vite:
 *
 * 1. `index.html` at the root and under `dashboard/`, plus `.nojekyll` (without
 *    it, Pages runs Jekyll and drops directories that start with `_`).
 * 2. Every absolute `src`/`href` in those documents resolves to a file inside
 *    the site, read relative to the site root.
 * 3. Each document loads at least one script and one stylesheet — a page with
 *    neither is a build that half-failed.
 * 4. No document points at `localhost` or `127.0.0.1`: a published page that
 *    only works on the machine that built it is worse than no page.
 *
 * Usage: node scripts/check-site.mjs site
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The sub-path this repository's Pages site is published under. */
export const SITE_PREFIX = '/Aeroscribe/';

/** Documents that must exist, relative to the site root. */
export const REQUIRED_DOCUMENTS = ['index.html', 'dashboard/index.html'];

/** The attribute pairs a browser fetches automatically. */
const REFERENCE = /\b(?:src|href)\s*=\s*"([^"]*)"/g;

const LOCAL_HOST = /(?:^|[/:])(?:localhost|127\.0\.0\.1)(?:[:/]|$)/;

async function exists(path) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Resolve a URL from an HTML document to a path inside the site.
 *
 * Only absolute URLs are checked: relative ones (`./favicon.svg`) are resolved
 * by the browser against the document and cannot leave the site. Fragments and
 * mailto links are not files.
 */
export function targetOf(documentPath, url) {
  if (!url.startsWith('/')) return null;
  if (!url.startsWith(SITE_PREFIX)) {
    return { outsidePrefix: true, path: url };
  }
  const withoutPrefix = url.slice(SITE_PREFIX.length);
  const withoutQuery = withoutPrefix.split('#')[0].split('?')[0];
  const relative = withoutQuery.endsWith('/') ? `${withoutQuery}index.html` : withoutQuery;
  return { outsidePrefix: false, path: posix.normalize(relative) };
}

/**
 * Check an assembled site directory.
 *
 * Returns `{ problems, documents, references }`; `problems` is empty when the
 * artefact is publishable. It never throws for a bad site — the caller decides
 * whether a missing directory is a test failure or a deploy failure.
 */
export async function checkSite(directory) {
  const root = resolve(directory);
  const problems = [];
  const documents = [];
  let references = 0;

  if (!(await exists(root))) {
    return {
      problems: [`${directory} does not exist; nothing was assembled`],
      documents,
      references,
    };
  }
  if (!(await exists(join(root, '.nojekyll')))) {
    problems.push(
      '.nojekyll is missing: GitHub Pages would run Jekyll, which drops paths that start with "_"',
    );
  }

  for (const relative of REQUIRED_DOCUMENTS) {
    const path = join(root, relative.split('/').join(sep));
    if (!(await exists(path))) {
      problems.push(`${relative} is missing from the assembled site`);
      continue;
    }
    const html = await readFile(path, 'utf8');
    documents.push(relative);

    let scripts = 0;
    let styles = 0;
    for (const match of html.matchAll(REFERENCE)) {
      const url = match[1] ?? '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
        if (LOCAL_HOST.test(url)) {
          problems.push(
            `${relative} references ${url}, which only resolves on the machine that built it`,
          );
        }
        continue;
      }
      scripts += url.endsWith('.js') ? 1 : 0;
      styles += url.endsWith('.css') ? 1 : 0;

      const target = targetOf(relative, url);
      if (target === null) continue;
      if (target.outsidePrefix) {
        problems.push(
          `${relative} references ${url}, which is outside the published sub-path ${SITE_PREFIX}`,
        );
        continue;
      }
      references += 1;
      if (!(await exists(join(root, target.path.split('/').join(sep))))) {
        problems.push(
          `${relative} references ${url}, but ${target.path} is not in the assembled site`,
        );
      }
    }
    if (scripts === 0) problems.push(`${relative} loads no script; the page would render nothing`);
    if (styles === 0) problems.push(`${relative} loads no stylesheet`);
  }

  const assets = await readdir(join(root, 'assets')).catch(() => []);
  if (assets.length === 0) problems.push('assets/ is empty; the landing bundle was not copied');

  return { problems, documents, references };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const directory = process.argv[2] ?? 'site';
  const { problems, documents, references } = await checkSite(directory);
  if (problems.length > 0) {
    console.error(`[site] ${problems.length} problem(s) in ${directory}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('[site] Refusing to publish a site whose own URLs do not resolve.');
    process.exitCode = 1;
  } else {
    console.log(
      `[site] ${documents.length} document(s), ${references} absolute reference(s) checked in ${directory}; nothing to report.`,
    );
  }
}
