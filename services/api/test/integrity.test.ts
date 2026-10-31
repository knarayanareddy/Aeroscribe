// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards for claims the repository makes about itself that no compiler checks.
 *
 * These are deliberately narrow: each one fails only when a specific promise is
 * broken, and the failure message says what to do about it.
 */

const root = process.cwd();

/** Workspace directories that could declare a dependency. */
const WORKSPACES = [
  '',
  'apps/landing-page',
  'apps/dashboard',
  'packages/pipeline',
  'packages/ui',
  'services/api',
];

/**
 * Packages that would mean a language model is producing text or numbers.
 *
 * Not exhaustive by design: see `docs/adr/0001-deterministic-writer.md`. The
 * point is that adding one is a deliberate change with an ADR review, not a
 * transitive surprise.
 */
const MODEL_SDKS = [
  'openai',
  '@openai/api',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@google/genai',
  'cohere-ai',
  'langchain',
  'llamaindex',
  'ai',
];

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function manifest(directory: string): Promise<PackageManifest> {
  const text = await readFile(join(root, directory, 'package.json'), 'utf8');
  return JSON.parse(text) as PackageManifest;
}

describe('RULE-022 — no model calls', () => {
  it('declares no language-model SDK in any workspace', async () => {
    for (const workspace of WORKSPACES) {
      const pkg = await manifest(workspace);
      const declared = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ];

      for (const name of MODEL_SDKS) {
        expect(
          declared,
          `${name} is declared in ${workspace || 'the root'} package.json. Model calls make RULE-022 "Not met", not N/A — see docs/adr/0001-deterministic-writer.md before merging.`,
        ).not.toContain(name);
      }
    }
  });
});

describe('RULE-053 — no console.log in production code', () => {
  it('routes every log line through the structured logger', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const collect = async (directory: string): Promise<string[]> => {
      const entries = await readdir(join(root, directory), { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const relative = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await collect(relative)));
        else if (entry.name.endsWith('.ts')) files.push(relative);
      }
      return files;
    };

    const sources = await collect('services/api/src');
    expect(sources.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of sources) {
      const text = await readFile(join(root, file), 'utf8');
      for (const match of text.matchAll(/\bconsole\.(log|info|warn|error|debug)\(/g)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders, `Use lib/logger.ts instead: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('the integrity table points at files that exist', () => {
  it('names only real source files in the enforcement table', async () => {
    const doc = await readFile(resolve(root, 'specs/integrity-rules.md'), 'utf8');
    const rows = doc.split('\n').filter((line) => line.startsWith('| RULE-'));

    expect(rows.length).toBeGreaterThan(30);

    const referenced = new Set<string>();
    for (const row of rows) {
      for (const match of row.matchAll(/`((?:services|apps|packages|\.github)\/[^`]+)`/g)) {
        referenced.add(match[1]!);
      }
    }
    // Only rows that name a path from the repository root can be checked here;
    // the rest cite module-relative files (`agents/writing.ts`).
    expect(referenced.size).toBeGreaterThanOrEqual(4);

    const { stat } = await import('node:fs/promises');
    for (const path of referenced) {
      const exists = await stat(resolve(root, path)).then(
        () => true,
        () => false,
      );
      expect(exists, `specs/integrity-rules.md cites ${path}, which does not exist`).toBe(true);
    }
  });

  it('does not claim a rule is enforced by a file that has no such code', async () => {
    // RULE-032 and RULE-033 are "Not met"; if they are ever marked otherwise the
    // code has to exist. This keeps the upgrade honest in both directions.
    const doc = await readFile(resolve(root, 'specs/integrity-rules.md'), 'utf8');
    const row = (rule: string) =>
      doc.split('\n').find((line) => line.startsWith(`| ${rule}`)) ?? '';

    if (!row('RULE-032').includes('**Not met**')) {
      const sources = await readdir(resolve(root, 'services/api/src/agents'));
      expect(sources).toContain('citation.ts');
    }
    if (!row('RULE-033').includes('**Not met**')) {
      const files = await readdir(resolve(root, 'services/api/src/latex')).catch(() => []);
      expect(files).toContain('figures.ts');
    }
  });
});
