import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Docs from './Docs';

describe('Docs', () => {
  it('states that no publications exist yet', () => {
    render(<Docs />);

    expect(screen.getByText(/No publications to date/i)).toBeInTheDocument();
    expect(screen.queryByText(/doi\.org/i)).not.toBeInTheDocument();
  });

  it('links only to real documentation paths', () => {
    render(<Docs />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      expect(href).not.toBe('#');
      expect(href).not.toContain('doi.org');
      expect(href).toMatch(
        /^https:\/\/github\.com\/knarayanareddy\/Aeroscribe\/(blob|tree)\/main\//,
      );
    }
  });

  it('links every documented path to a file that exists in the repository', async () => {
    // A docs card pointing at a 404 is worse than no card: it looks like the
    // project has documentation it does not have.
    const { readFile, access } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const source = await readFile(
      resolve(process.cwd(), 'apps/landing-page/src/components/Docs.tsx'),
      'utf8',
    );

    const paths = Array.from(source.matchAll(/path: '([^']+)'/g), (match) => match[1]!);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      await expect(
        access(resolve(process.cwd(), path)),
        `${path} is missing`,
      ).resolves.toBeUndefined();
    }
  });

  it('describes the documents it links to', () => {
    render(<Docs />);

    const list = screen.getByRole('list');
    expect(within(list).getByText('specs/pipeline.md')).toBeInTheDocument();
    expect(within(list).getByText('specs/integrity-rules.md')).toBeInTheDocument();
    expect(within(list).getByText('docs/IMPLEMENTATION_STATUS.md')).toBeInTheDocument();
    expect(within(list).getByText('docs/BACKEND.md')).toBeInTheDocument();
  });
});
