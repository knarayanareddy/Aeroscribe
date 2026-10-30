// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CrossrefClient, mapCrossrefItem, stripJats } from '../src/literature/crossref';
import { ArxivClient, parseArxivFeed } from '../src/literature/arxiv';
import { SemanticScholarClient, mapS2Paper } from '../src/literature/semanticscholar';
import {
  LiteratureService,
  dedupePapers,
  isFixturePaper,
  rankPapers,
  titleSimilarity,
  type LiteratureProvider,
  type Paper,
} from '../src/literature';
import { OFFLINE_CORPUS, searchOfflineCorpus } from '../src/literature/fixtures';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Crossref mapping', () => {
  it('maps a work record and strips JATS markup from the abstract', () => {
    const paper = mapCrossrefItem({
      DOI: '10.2514/1.J060000',
      title: ['  Detonation  cell  width   in  RDEs '],
      author: [{ given: 'Ada', family: 'Lovelace' }, { name: 'A Consortium' }],
      issued: { 'date-parts': [[2024, 5, 1]] },
      abstract: '<jats:p>Cell width <jats:italic>decreases</jats:italic> with pressure.</jats:p>',
      'is-referenced-by-count': 42,
      URL: 'https://doi.org/10.2514/1.J060000',
    });

    expect(paper).not.toBeNull();
    expect(paper!.doi).toBe('10.2514/1.j060000');
    expect(paper!.title).toBe('Detonation cell width in RDEs');
    expect(paper!.authors).toEqual(['Ada Lovelace', 'A Consortium']);
    expect(paper!.year).toBe(2024);
    expect(paper!.abstract).toBe('Cell width decreases with pressure.');
    expect(paper!.citationCount).toBe(42);
  });

  it('returns null for a record with neither DOI nor title', () => {
    expect(mapCrossrefItem({})).toBeNull();
  });

  it('flattens JATS and decodes entities', () => {
    expect(stripJats('<jats:p>a &amp; b</jats:p>')).toBe('a & b');
    expect(stripJats(undefined)).toBeNull();
  });

  it('queries Crossref through the injected fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          items: [{ DOI: '10.2514/1.J060000', title: ['A study'], author: [{ family: 'Hopper' }] }],
        },
      }),
    );

    const client = new CrossrefClient({
      fetchImpl,
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    const papers = await client.search('detonation', 5);

    expect(papers).toHaveLength(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('api.crossref.org/works?');
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('rows=5');
  });

  it('returns null for an unknown DOI and throws on a server error', async () => {
    const notFound = new CrossrefClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({}, 404)),
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    expect(await notFound.resolveDoi('10.2514/1.J060000')).toBeNull();

    const broken = new CrossrefClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({}, 400)),
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    await expect(broken.resolveDoi('10.2514/1.J060000')).rejects.toThrow(/HTTP 400/);
  });
});

describe('arXiv parsing', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2401.01234v2</id>
    <title>RDE  stability  at  altitude</title>
    <summary>Cell width shrinks with pressure.</summary>
    <published>2024-01-02T00:00:00Z</published>
    <author><name>Jane Doe</name></author>
    <author><name>John Roe</name></author>
    <arxiv:doi>10.2514/1.J060001</arxiv:doi>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2305.99999v1</id>
    <title>Unrelated</title>
    <summary>No DOI here.</summary>
  </entry>
</feed>`;

  it('parses entries, strips versions and picks up the arXiv DOI', () => {
    const papers = parseArxivFeed(feed);
    expect(papers).toHaveLength(2);
    expect(papers[0]!.id).toBe('arxiv:2401.01234');
    expect(papers[0]!.title).toBe('RDE stability at altitude');
    expect(papers[0]!.authors).toEqual(['Jane Doe', 'John Roe']);
    expect(papers[0]!.year).toBe(2024);
    expect(papers[0]!.doi).toBe('10.2514/1.j060001');
    expect(papers[1]!.doi).toBeNull();
  });

  it('returns an empty list for a feed without entries', () => {
    expect(parseArxivFeed('<feed></feed>')).toEqual([]);
  });

  it('never claims to verify a DOI', async () => {
    const client = new ArxivClient({ minIntervalMs: 0 });
    expect(await client.resolveDoi('10.2514/1.J060001')).toBeNull();
  });
});

describe('Semantic Scholar mapping', () => {
  it('maps fields and flattens nulls', () => {
    const paper = mapS2Paper({
      paperId: 'abc',
      title: 'Wing morphing',
      abstract: null,
      year: null,
      authors: [{ name: 'A. Author' }],
      externalIds: { DOI: '10.2514/1.J060002' },
      citationCount: null,
      url: null,
    });

    expect(paper).toMatchObject({
      source: 'semantic-scholar',
      title: 'Wing morphing',
      year: null,
      doi: '10.2514/1.j060002',
      citationCount: null,
    });
  });

  it('returns null without a title', () => {
    expect(mapS2Paper({ paperId: 'x' })).toBeNull();
  });

  it('sends the API key header when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new SemanticScholarClient({
      apiKey: 'test-key',
      fetchImpl,
      sleep: async () => undefined,
      minIntervalMs: 0,
    });

    await client.search('wing morphing', 3);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
  });
});

describe('dedupe and ranking', () => {
  const base: Paper = {
    id: 'a',
    source: 'crossref',
    title: 'Detonation Cell Width',
    authors: ['A'],
    year: 2024,
    doi: '10.2514/1.j060000',
    url: null,
    abstract: null,
    citationCount: 5,
  };

  it('merges records that share a DOI', () => {
    const merged = dedupePapers([
      base,
      { ...base, id: 'b', source: 'semantic-scholar', abstract: 'x' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.abstract).toBe('x');
  });

  it('merges records that share a normalised title when no DOI exists', () => {
    const merged = dedupePapers([
      { ...base, doi: null, title: 'Detonation cell width' },
      { ...base, doi: null, id: 'c', title: 'detonation  CELL width' },
    ]);
    expect(merged).toHaveLength(1);
  });

  it('ranks DOI-bearing records above uncited ones', () => {
    const ranked = rankPapers([
      { ...base, doi: null, id: 'no-doi', citationCount: 900 },
      { ...base, id: 'with-doi', citationCount: 1 },
    ]);
    expect(ranked[0]!.id).toBe('with-doi');
  });
});

describe('titleSimilarity', () => {
  it('scores overlapping titles highly and unrelated titles low', () => {
    expect(
      titleSimilarity('Detonation cell width in RDEs', 'Detonation cell width measurements'),
    ).toBeGreaterThan(0.5);
    expect(titleSimilarity('Detonation cell width', 'Orbital mechanics of cubesats')).toBe(0);
    expect(titleSimilarity('', 'anything')).toBe(0);
  });
});

function makeProvider(overrides: Partial<LiteratureProvider> = {}): LiteratureProvider {
  return {
    name: 'crossref',
    requiresNetwork: true,
    search: vi.fn().mockResolvedValue([
      {
        id: 'crossref:10.2514/1.j060000',
        source: 'crossref',
        title: 'Detonation cell width',
        authors: ['A'],
        year: 2024,
        doi: '10.2514/1.j060000',
        url: null,
        abstract: 'abstract',
        citationCount: 3,
      },
    ]),
    resolveDoi: vi.fn().mockResolvedValue({
      id: 'crossref:10.2514/1.j060000',
      source: 'crossref',
      title: 'Detonation cell width',
      authors: ['A'],
      year: 2024,
      doi: '10.2514/1.j060000',
      url: null,
      abstract: null,
      citationCount: 3,
    }),
    ...overrides,
  };
}

describe('LiteratureService', () => {
  it('reports per-provider failures instead of hiding them', async () => {
    const failing = makeProvider({
      name: 'arxiv',
      search: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')),
    });
    const service = new LiteratureService({
      providers: [makeProvider(), failing],
      clock: () => new Date('2026-10-30T12:00:00Z'),
    });

    const report = await service.search('detonation cell width', { limit: 5 });

    expect(report.papers).toHaveLength(1);
    expect(report.errors).toEqual([{ provider: 'arxiv', message: '503 Service Unavailable' }]);
    expect(report.executedAt).toBe('2026-10-30T12:00:00.000Z');
  });

  it('returns nothing for a query that is too short', async () => {
    const provider = makeProvider();
    const service = new LiteratureService({ providers: [provider] });
    const report = await service.search('ab');
    expect(report.papers).toEqual([]);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('uses only the fictional corpus in offline mode', async () => {
    const provider = makeProvider();
    const service = new LiteratureService({ providers: [provider], offline: true });

    const report = await service.search('detonation', { limit: 3 });

    expect(provider.search).not.toHaveBeenCalled();
    expect(report.papers.every(isFixturePaper)).toBe(true);
    expect(report.papers.every((paper) => paper.doi === null)).toBe(true);
  });

  it('verifies a DOI only when a registry returns the record', async () => {
    const service = new LiteratureService({
      providers: [makeProvider()],
      clock: () => new Date('2026-10-30T12:00:00Z'),
    });
    const result = await service.verifyDoi('https://doi.org/10.2514/1.J060000');

    expect(result.verified).toBe(true);
    expect(result.provider).toBe('crossref');
    expect(result.normalised).toBe('10.2514/1.j060000');
  });

  it('rejects a malformed DOI without any network call', async () => {
    const provider = makeProvider();
    const service = new LiteratureService({ providers: [provider] });
    const result = await service.verifyDoi('not-a-doi');

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/valid DOI/);
    expect(provider.resolveDoi).not.toHaveBeenCalled();
  });

  it('fails verification when no provider knows the DOI', async () => {
    const service = new LiteratureService({
      providers: [makeProvider({ resolveDoi: vi.fn().mockResolvedValue(null) })],
    });
    const result = await service.verifyDoi('10.2514/1.J060999');
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });

  it('fails verification when the resolved title does not match', async () => {
    const service = new LiteratureService({ providers: [makeProvider()] });
    const result = await service.verifyDoi('10.2514/1.J060000', {
      expectedTitle: 'Orbital mechanics of cubesats',
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/title does not match/);
  });

  it('refuses verification in offline mode', async () => {
    const service = new LiteratureService({ providers: [makeProvider()], offline: true });
    const result = await service.verifyDoi('10.2514/1.J060000');
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/offline/);
  });

  it('treats an implausible publication year as unverified', async () => {
    const service = new LiteratureService({
      providers: [
        makeProvider({
          resolveDoi: vi.fn().mockResolvedValue({
            id: 'x',
            source: 'crossref',
            title: 'Detonation cell width',
            authors: [],
            year: 3024,
            doi: '10.2514/1.j060000',
            url: null,
            abstract: null,
            citationCount: 0,
          }),
        }),
      ],
    });
    const result = await service.verifyDoi('10.2514/1.J060000');
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/implausible publication year/);
  });
});

describe('offline corpus', () => {
  it('is fictional, DOI-free and keyword searchable', () => {
    expect(OFFLINE_CORPUS.length).toBeGreaterThan(3);
    expect(OFFLINE_CORPUS.every((paper) => paper.doi === null)).toBe(true);
    expect(OFFLINE_CORPUS.every((paper) => paper.title.startsWith('Offline fixture'))).toBe(true);

    const hits = searchOfflineCorpus('detonation cell width pressure', 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});
