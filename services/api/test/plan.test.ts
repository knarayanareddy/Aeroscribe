// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CfdEvidencePayload, EvidenceRecord, ManuscriptPayload } from '@aeroscribe/contract';
import { DEFAULT_JOURNAL_TARGET, type JournalTarget } from '@aeroscribe/pipeline';
import {
  buildPlan,
  checkProjection,
  hasNumeral,
  planFacts,
  renderParagraph,
  renderPlan,
  type PlanNumber,
} from '../src/agents/plan';

/**
 * The manuscript plan.
 *
 * RULE-030's hierarchy is only worth anything if it is a record other stages can
 * read. These tests pin the two properties that make it one: the plan is a pure
 * function of evidence (so it can be rebuilt and compared), and the prose is a
 * projection of it (so text the plan did not ask for has nowhere to come from).
 */

function cfdPayload(overrides: Partial<CfdEvidencePayload> = {}): CfdEvidencePayload {
  return {
    stage: 'evidence-generation',
    schemaVersion: 1,
    quantity: 'drag coefficient',
    unit: 'dimensionless',
    solver: 'synthetic',
    value: 0.4263912,
    uncertainty: 0.00000336,
    method: 'synthetic analytic benchmark (true order 2), three meshes, Roache GCI',
    notes: ['Synthetic solver: no Navier–Stokes equations were solved.'],
    disclaimer: 'Synthetic solver: no Navier–Stokes equations were solved.',
    gci: {
      levels: [
        { level: 'coarse', cells: 125_000, value: 0.4381 },
        { level: 'medium', cells: 1_000_000, value: 0.4299 },
        { level: 'fine', cells: 8_000_000, value: 0.4271 },
      ],
      apparentOrder: 2,
      fineGciPercent: 0.000787,
      mediumGciPercent: 0.0031,
      asymptoticRatio: 1.01,
      valid: true,
    },
    artefacts: [],
    computedAt: '2026-11-01T09:00:00.000Z',
    ...overrides,
  };
}

function record(seq: number, kind: EvidenceRecord['kind'], payload: unknown): EvidenceRecord {
  return {
    seq,
    id: `${kind}-${seq}`,
    kind,
    runId: 'run-1',
    stageId: null,
    label: kind,
    createdAt: '2026-11-01T09:00:00.000Z',
    payload,
    payloadHash: `${seq}`.padStart(64, 'a'),
    prevHash: '',
    hash: `${seq}`.padStart(64, 'b'),
  };
}

function records(cfd = cfdPayload()): EvidenceRecord[] {
  return [
    record(1, 'stage-output', {
      stage: 'topic-intelligence',
      topicNumbers: [0.78],
    }),
    record(3, 'stage-output', {
      stage: 'contribution-framing',
      statement: 'This work addresses riblets in transonic flow (4 DOI-verified references).',
      evidenceBasis: { verifiedReferences: 4, gaps: 2 },
    }),
    record(4, 'literature-search', { references: [] }),
    record(5, 'novelty-report', { gapCount: 2 }),
    record(6, 'cfd-run', cfd),
  ];
}

function plan(cfd = cfdPayload(), journal: JournalTarget = DEFAULT_JOURNAL_TARGET) {
  const facts = planFacts(cfd, { statement: 'Framing statement.' }, [0.78]);
  return buildPlan({
    runId: 'run-1',
    journal,
    records: records(cfd),
    facts,
    generatedAt: '2026-11-01T10:00:00.000Z',
  });
}

function numbers(cfd = cfdPayload()): Record<string, PlanNumber> {
  return {
    topicNumber1: { value: 0.78, text: '0.78' },
    value: { value: 0.4264, text: '0.4264' },
    uncertainty: { value: 0.00000336, text: '0.00000336' },
    gciPercent: { value: 0.000787, text: '0.000787' },
    apparentOrder: { value: 2, text: '2' },
    verifiedReferences: { value: 0, text: '0' },
    gaps: { value: 2, text: '2' },
    meshCount: { value: 3, text: '3' },
    framingVerifiedReferences: { value: 4, text: '4' },
    framingGapCount: { value: 2, text: '2' },
    ...(cfd.gci?.valid ? {} : {}),
  };
}

describe('buildPlan', () => {
  it('is a pure function of the evidence: same records, same plan', () => {
    const first = plan();
    const second = plan();
    expect(second).toEqual(first);
  });

  it('follows the journal section order and ends with the disclosure', () => {
    expect(plan().sections.map((section) => section.heading)).toEqual([
      ...DEFAULT_JOURNAL_TARGET.sectionOrder,
      'AI use disclosure',
    ]);
  });

  it('gives every paragraph a unique id and a stated job', () => {
    const paragraphs = plan().sections.flatMap((section) => section.paragraphs);
    expect(new Set(paragraphs.map((paragraph) => paragraph.id)).size).toBe(paragraphs.length);
    for (const paragraph of paragraphs) {
      expect(paragraph.id).toMatch(/^p-[a-z]+-\d+$/);
      expect(paragraph.intent.length).toBeGreaterThan(0);
      expect(paragraph.targetWords).toBeGreaterThan(0);
    }
  });

  it('names the evidence record each paragraph may draw on', () => {
    const paragraphs = plan().sections.flatMap((section) => section.paragraphs);
    const refs = new Set(paragraphs.flatMap((paragraph) => paragraph.evidenceRefs));
    // Real seqs from the registry, not kind names that resolve to nothing.
    expect([...refs].every((ref) => /^[a-z-]+#\d+$/.test(ref))).toBe(true);
    expect(refs.has('cfd-run#6')).toBe(true);
    expect(refs.has('contribution-framing#3')).toBe(false);
    expect(refs.has('stage-output#3')).toBe(true);
  });

  it('declares the topic numbers only for the paragraph that quotes the topic', () => {
    const paragraphs = plan().sections.flatMap((section) => section.paragraphs);
    const withTopic = paragraphs.filter((paragraph) =>
      paragraph.numberKeys.includes('topicNumber1'),
    );
    expect(withTopic.map((paragraph) => paragraph.id)).toEqual(['p-introduction-1']);
  });

  it('drops the grid-study paragraph numbers when the study is not valid', () => {
    const invalid = cfdPayload({
      gci: { ...cfdPayload().gci!, valid: false, reason: 'values oscillate' },
    });
    const paragraphs = plan(invalid).sections.flatMap((section) => section.paragraphs);
    const results = paragraphs.find((paragraph) => paragraph.id === 'p-results-2')!;
    expect(results.intent).toBe('results-grid-rejected');
    expect(results.numberKeys).toEqual([]);
  });

  it('refuses to plan a section it has no paragraphs for', () => {
    const journal: JournalTarget = {
      ...DEFAULT_JOURNAL_TARGET,
      sectionOrder: [...DEFAULT_JOURNAL_TARGET.sectionOrder, 'Appendix'],
    };
    expect(() => plan(cfdPayload(), journal)).toThrow(
      /no planned paragraphs for the journal section "Appendix"/,
    );
  });

  it('states the paper architecture without pretending to be a model', () => {
    const payload = plan();
    expect(payload.stage).toBe('plan');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.architecture).toMatch(/plan written before the text/);
    expect(payload.runId).toBe('run-1');
  });
});

describe('renderPlan', () => {
  const context = () => ({
    topic: 'transonic wing drag prediction for a Mach 0.78 transport',
    cfd: cfdPayload(),
    numbers: numbers(),
    framing: {
      statement: 'This work addresses riblets in transonic flow (4 DOI-verified references).',
    },
    notes: ['Synthetic solver: no Navier–Stokes equations were solved.'],
    disclaimer: 'Synthetic solver: no Navier–Stokes equations were solved.',
  });

  it('renders one paragraph per planned paragraph, in order', () => {
    const payload = plan();
    const sections = renderPlan(payload, context());
    expect(sections.map((section) => section.heading)).toEqual(
      payload.sections.map((section) => section.heading),
    );
    for (const [index, section] of sections.entries()) {
      expect(section.paragraphs?.map((paragraph) => paragraph.id)).toEqual(
        payload.sections[index]!.paragraphs.map((paragraph) => paragraph.id),
      );
      expect(section.body).toBe(
        section.paragraphs!.map((paragraph) => paragraph.text).join('\n\n'),
      );
    }
  });

  it('refuses to print a number the paragraph did not declare', () => {
    const payload = plan();
    const results = payload.sections
      .find((section) => section.heading === 'Results')!
      .paragraphs.find((paragraph) => paragraph.id === 'p-results-1')!;
    expect(() => renderParagraph({ ...results, numberKeys: [] }, context())).toThrow(
      /paragraph p-results-1 printed "value" but its plan declares \[\]/,
    );
  });

  it('agrees with its own count: one gap is a term, two are terms', () => {
    const single = renderPlan(plan(), {
      ...context(),
      numbers: { ...numbers(), gaps: { value: 1, text: '1' } },
    });
    const one = single.find((section) => section.heading === 'Discussion')!;
    expect(one.body).toContain('1 topic term was not covered by that literature.');

    const two = renderPlan(plan(), context()).find((section) => section.heading === 'Discussion')!;
    expect(two.body).toContain('2 topic terms were not covered by that literature.');
  });

  it('refuses to print a count the paragraph did not declare', () => {
    const payload = plan();
    const gaps = payload.sections
      .find((section) => section.heading === 'Discussion')!
      .paragraphs.find((paragraph) => paragraph.id === 'p-discussion-2')!;
    // `count()` prints the number and agrees with it, so it is checked here and
    // not only at the number the sentence happens to show.
    expect(() => renderParagraph({ ...gaps, numberKeys: ['value'] }, context())).toThrow(
      /paragraph p-discussion-2 printed "gaps" but its plan declares \[value\]/,
    );
  });

  it('refuses an intent with no renderer instead of emitting an empty paragraph', () => {
    const payload = plan();
    const paragraph = payload.sections[0]!.paragraphs[0]!;
    expect(() =>
      renderParagraph({ ...paragraph, intent: 'write-something-nice' }, context()),
    ).toThrow(/no renderer for plan intent "write-something-nice"/);
  });

  it('says a rejected grid study is rejected, without quoting its diagnosis', () => {
    const invalid = cfdPayload({
      gci: {
        ...cfdPayload().gci!,
        valid: false,
        reason: 'GCI ratio 2.150, expected 1.000 ± 0.150',
      },
    });
    const sections = renderPlan(plan(invalid), {
      ...context(),
      cfd: invalid,
      numbers: { ...numbers(), value: { value: 0.4381, text: '0.4381' } },
    });
    const results = sections.find((section) => section.heading === 'Results')!;
    expect(results.body).toMatch(/grid study was rejected/);
    // The record's free-text reason carries numbers of its own; the prose does not
    // quote it, because a paragraph's numbers must all be declared keys.
    expect(results.body).not.toContain('2.150');
  });
});

describe('checkProjection', () => {
  function manuscript(planPayload = plan()): ManuscriptPayload {
    const sections = renderPlan(planPayload, {
      topic: 'transonic wing drag prediction for a Mach 0.78 transport',
      cfd: cfdPayload(),
      numbers: numbers(),
      framing: {
        statement: 'This work addresses riblets in transonic flow (4 DOI-verified references).',
      },
      notes: ['Synthetic solver: no Navier–Stokes equations were solved.'],
      disclaimer: 'Synthetic solver: no Navier–Stokes equations were solved.',
    });
    return {
      stage: 'paper-synthesis',
      schemaVersion: 2,
      title: 'transonic wing drag prediction: a verification-first computational study',
      journal: DEFAULT_JOURNAL_TARGET.name,
      journalId: DEFAULT_JOURNAL_TARGET.id,
      sections,
      abstract: 'An abstract.',
      wordCount: 100,
      referenceCount: 0,
      references: [],
      numbers: Object.fromEntries(
        Object.entries(numbers()).map(([key, entry]) => [key, entry.value]),
      ),
      planRef: { seq: 7, hash: `${7}`.padStart(64, 'a') },
      citations: [],
      generatedAt: '2026-11-01T10:00:00.000Z',
      synthetic: true,
    };
  }

  const planRecord = (planPayload = plan()) => record(7, 'manuscript-plan', planPayload);
  const evidence = () => [...records(), planRecord()];

  it('accepts the text the plan produced', () => {
    const report = checkProjection(manuscript(), evidence());
    expect(report.major).toEqual([]);
    expect(report.checked).toBe(true);
  });

  it('reports a planned paragraph that is missing from the text', () => {
    const payload = manuscript();
    payload.sections = payload.sections.map((section) =>
      section.heading === 'Discussion'
        ? { ...section, paragraphs: section.paragraphs!.slice(0, 1) }
        : section,
    );
    const report = checkProjection(payload, evidence());
    expect(report.major.join(' ')).toMatch(
      /The plan's paragraph p-discussion-2 \(discussion-gaps\) is missing/,
    );
  });

  it('reports text the plan never asked for', () => {
    const payload = manuscript();
    payload.sections = payload.sections.map((section) =>
      section.heading === 'Conclusion'
        ? {
            ...section,
            paragraphs: [...section.paragraphs!, { id: 'p-conclusion-9', text: 'Thanks.' }],
          }
        : section,
    );
    const report = checkProjection(payload, evidence());
    expect(report.major.join(' ')).toMatch(
      /contains paragraph p-conclusion-9, which the plan does not list/,
    );
  });

  it('reports a number the paragraph did not declare, and accepts a rounded one', () => {
    const payload = manuscript();
    payload.sections = payload.sections.map((section) =>
      section.heading === 'Results'
        ? {
            ...section,
            paragraphs: section.paragraphs!.map((paragraph) =>
              paragraph.id === 'p-results-1'
                ? { ...paragraph, text: `${paragraph.text} It needed 17 iterations.` }
                : paragraph,
            ),
          }
        : section,
    );
    const report = checkProjection(payload, evidence());
    expect(report.major.join(' ')).toMatch(/Paragraph p-results-1 prints 17/);

    // A number rounded to fewer digits than the record stores is still that
    // number: the plan declares values, not spellings.
    const rounded = manuscript();
    rounded.numbers = { ...rounded.numbers, value: 0.4263912 };
    rounded.sections = rounded.sections.map((section) =>
      section.heading === 'Results'
        ? {
            ...section,
            paragraphs: section.paragraphs!.map((paragraph) =>
              paragraph.id === 'p-results-1'
                ? {
                    ...paragraph,
                    text: 'The extrapolated drag coefficient is 0.4264 ± 0.00000336.',
                  }
                : paragraph,
            ),
          }
        : section,
    );
    expect(checkProjection(rounded, evidence()).major).toEqual([]);
  });

  it('reports an overlong paragraph as a minor finding', () => {
    const payload = manuscript();
    const padding = Array.from({ length: 40 }, () => 'word').join(' ');
    payload.sections = payload.sections.map((section) =>
      section.heading === 'Conclusion'
        ? {
            ...section,
            paragraphs: section.paragraphs!.map((paragraph) =>
              paragraph.id === 'p-conclusion-2'
                ? { ...paragraph, text: `${paragraph.text} ${padding}` }
                : paragraph,
            ),
          }
        : section,
    );
    const report = checkProjection(payload, evidence());
    expect(report.major).toEqual([]);
    expect(report.minor.join(' ')).toMatch(
      /Paragraph p-conclusion-2 is \d+ words against a 25-word target/,
    );
  });

  it('reports a planRef that does not resolve, points elsewhere or lies about the hash', () => {
    const base = manuscript();

    expect(
      checkProjection({ ...base, planRef: { seq: 99, hash: 'x' } }, evidence()).major.join(' '),
    ).toMatch(/names evidence #99, which this run does not contain/);

    expect(checkProjection(base, records()).major.join(' ')).toMatch(
      /planRef names evidence #7, which this run does not contain/,
    );

    const wrongKind = [...records(), record(7, 'manuscript', {})];
    expect(checkProjection(base, wrongKind).major.join(' ')).toMatch(
      /whose kind is "manuscript", not "manuscript-plan"/,
    );

    expect(
      checkProjection(
        { ...base, planRef: { seq: 7, hash: 'f'.repeat(64) } },
        evidence(),
      ).major.join(' '),
    ).toMatch(/planRef hashes evidence #7/);
  });

  it('reports a manuscript with no planRef, and does not pretend to check a pre-plan one', () => {
    const base = manuscript();
    expect(checkProjection({ ...base, planRef: undefined }, evidence()).major.join(' ')).toMatch(
      /carries no planRef/,
    );

    const ancient: ManuscriptPayload = {
      ...base,
      planRef: undefined,
      sections: base.sections.map((section) => ({ heading: section.heading, body: section.body })),
    };
    const report = checkProjection(ancient, records());
    expect(report).toEqual({ checked: false, major: [], minor: [] });
  });

  it('reports a declared number the numbers table does not carry', () => {
    const payload = manuscript();
    const { value: _dropped, ...rest } = payload.numbers;
    void _dropped;
    const report = checkProjection({ ...payload, numbers: rest }, evidence());
    expect(report.major.join(' ')).toMatch(/declares the number key "value"/);
  });
});

describe('planFacts', () => {
  it('quotes only the notes and disclaimers that carry no numeral', () => {
    const facts = planFacts(
      cfdPayload({
        notes: ['No equations were solved.', 'Observed order 2.00 with GCI 0.000787%.'],
        disclaimer: 'See the record for the solver version.',
      }),
      undefined,
      [0.78, 3],
    );
    expect(facts.quotableNotes).toEqual(['No equations were solved.']);
    expect(facts.quotableDisclaimer).toBe('See the record for the solver version.');
    expect(facts.topicNumberKeys).toEqual(['topicNumber1', 'topicNumber2']);
  });

  it('has no framing and no study when the records are absent', () => {
    const facts = planFacts(undefined, undefined);
    expect(facts).toMatchObject({ hasFraming: false, gciValid: false, meshCount: 0 });
  });

  it('recognises a numeral without trying to interpret it', () => {
    expect(hasNumeral('order 2')).toBe(true);
    expect(hasNumeral('no equations were solved')).toBe(false);
  });
});
