import { describe, expect, it } from 'vitest';
import recordedEvidence from '../../dashboard/src/api/__fixtures__/evidence.json';
import {
  chain,
  council,
  firstReference,
  gateCount,
  gci,
  headline,
  manuscript,
  mesh,
  plan,
  resultsParagraph,
  run,
  stages,
  submission,
  typesetting,
} from './data';
import { SCENES, durationSeconds, timeline, totalFrames } from './timeline';

/**
 * The video's facts are the recorded run's facts.
 *
 * A frame of video is the one artefact nobody diffs, so the things it asserts
 * are asserted here instead: every figure the scenes print comes from the
 * capture, and the capture is the one the dashboard's tests read.
 */
describe('the demo is built from the recorded run', () => {
  const records = (recordedEvidence as { records: Array<{ kind: string }> }).records;

  it('reads the same capture the dashboard tests read', () => {
    // Every evidence kind this video needs is in the committed fixture, so a
    // re-record that drops one fails here rather than rendering a blank panel.
    const kinds = new Set(records.map((record) => record.kind));
    for (const kind of [
      'cfd-run',
      'manuscript-plan',
      'manuscript',
      'review-report',
      'manuscript-render',
      'compliance-report',
    ]) {
      expect(kinds, `fixture has no ${kind}`).toContain(kind);
    }
    expect(chain).toHaveLength(records.length);
  });

  it('prints the manuscript’s own result, at the manuscript’s precision', () => {
    // `headline()` is the value ± the uncertainty the payload records — not a
    // rounding of the raw solver output, which would disagree with the prose.
    expect(headline()).toBe(
      `${String(manuscript.numbers['value'])} \u00b1 ${String(manuscript.numbers['uncertainty'])}`,
    );
    expect(resultsParagraph.text).toContain(headline());
    expect(run.wordCount).toBe(manuscript.wordCount);
    expect(run.referenceCount).toBe(manuscript.references.length);
  });

  it('shows the plan the manuscript names, not a plan it invented', () => {
    expect(run.planSeq).not.toBeNull();
    const planRecord = chain.find((record) => record.kind === 'manuscript-plan');
    expect(planRecord?.seq).toBe(run.planSeq);
    expect(planRecord?.payloadHash).toBe(run.planHash);
    const ids = plan.sections.flatMap((section) => section.paragraphs.map((entry) => entry.id));
    expect(ids).toContain(resultsParagraph.id);
  });

  it('draws the mesh table the record holds, coarsest first', () => {
    expect(mesh.map((level) => level.cells)).toEqual([250_000, 2_000_000, 16_000_000]);
    expect(gci.valid).toBe(true);
    expect(gci.finePercent).not.toBeNull();
  });

  it('reports the council as it ruled, including the failures', () => {
    // The video's honesty rests on this: the run failed, and the numbers on
    // screen say so rather than a pass the record never recorded.
    expect(council.verdict).toBe('revise');
    expect(council.checks.some((check) => !check.passed)).toBe(true);
    expect(council.checks.every((check) => check.skipped === false)).toBe(true);
  });

  it('labels the typesetting outcome the render recorded', () => {
    expect(['pdf', 'source-only']).toContain(typesetting.typeset);
    expect(typesetting.files.map((file) => file.name)).toContain('figure-gci.dat');
    // The scene says "stage 8: blocked" only because the record is blocked, and
    // the blockers it prints are the record's own strings.
    expect(submission.status).toBe('blocked');
    expect(submission.blockers.length).toBeGreaterThan(0);
    expect(submission.blockers.every((blocker) => blocker.length > 10)).toBe(true);
    expect(submission.compliant).toBe(
      (
        recordedEvidence as { records: Array<{ kind: string; payload: { compliant?: boolean } }> }
      ).records.find((record) => record.kind === 'compliance-report')?.payload.compliant,
    );
  });

  it('counts the gates and the stages from the catalogue', () => {
    expect(stages).toHaveLength(9);
    expect(gateCount).toBe(11);
    // The recording carries identifiers only; a citation line is the point of
    // the citations scene, so it must not be empty.
    expect(firstReference.key).toMatch(/^ref-\d+$/);
  });
});

describe('the timeline', () => {
  it('places every scene after the one before it, with no gaps', () => {
    expect(timeline[0]?.from).toBe(0);
    for (const [index, scene] of timeline.entries()) {
      if (index === 0) continue;
      const previous = timeline[index - 1]!;
      expect(scene.from).toBe(previous.from + previous.frames);
    }
    expect(totalFrames).toBe(SCENES.reduce((total, scene) => total + scene.frames, 0));
  });

  it('is long enough to read and short enough to watch', () => {
    // Under two minutes at 30 fps: a demo nobody finishes is a demo nobody sees.
    expect(durationSeconds).toBeGreaterThan(30);
    expect(durationSeconds).toBeLessThan(120);
  });
});
