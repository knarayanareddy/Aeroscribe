import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mp3DurationSeconds } from './mp3';
import { NARRATION, NARRATION_SECONDS, narrationFile, spoken } from './narration';
import { FPS, LEAD_FRAMES, TAIL_FRAMES, timeline } from './timeline';

// Vitest runs from the repository root, as the other suites assume.
const publicDir = resolve(process.cwd(), 'apps/demo-video/public');

/**
 * The narration is the one part of the video a reviewer cannot diff and a
 * viewer cannot check, so the things that *can* be checked are checked here:
 * that every scene has a script and a clip, that the clip exists and has real
 * audio in it, and that the timeline leaves room for it.
 */
describe('every scene has narration', () => {
  it('covers exactly the scenes on the timeline', () => {
    expect(Object.keys(NARRATION).sort()).toEqual(timeline.map((scene) => scene.id).sort());
    expect(Object.keys(NARRATION_SECONDS).sort()).toEqual(timeline.map((scene) => scene.id).sort());
  });

  it('ships a clip for every scene, and the clip has audio in it', () => {
    for (const scene of timeline) {
      const path = resolve(publicDir, narrationFile(scene.id));
      const info = statSync(path);
      // 11–20 seconds of speech at 64 kbps is 90–160 kB; anything under 20 kB
      // is a truncated file or a silent one the synthesiser refused.
      expect(info.size, `${scene.id}.mp3 is ${String(info.size)} bytes`).toBeGreaterThan(20_000);
    }
  });

  it('declares each clip’s real length, not an estimate of it', () => {
    // The cut is built from `NARRATION_SECONDS`, so this is the assertion that
    // makes a re-record safe: change a line without updating the constant and
    // the suite says by how much, instead of the voice running into the next
    // scene in a render nobody re-watches.
    for (const scene of timeline) {
      const bytes = new Uint8Array(readFileSync(resolve(publicDir, narrationFile(scene.id))));
      const measured = mp3DurationSeconds(bytes);
      expect(
        Math.abs(measured - NARRATION_SECONDS[scene.id]),
        `${scene.id}: declared ${String(NARRATION_SECONDS[scene.id])}s, clip is ${measured.toFixed(2)}s`,
      ).toBeLessThan(0.05);
    }
  });

  it('leaves each scene long enough for its own clip', () => {
    for (const scene of timeline) {
      const spoken = Math.ceil(NARRATION_SECONDS[scene.id] * FPS);
      expect(scene.audioFrames).toBe(spoken);
      // The scene is the clip plus its lead and tail, so the voice can never
      // be cut off by the cut. This is the assertion that catches a re-record.
      expect(scene.frames).toBeGreaterThanOrEqual(LEAD_FRAMES + spoken + TAIL_FRAMES);
    }
  });

  it('keeps the script free of things a voice reads badly', () => {
    for (const [scene, text] of Object.entries(NARRATION)) {
      // `3.36e-06` gets read as "three point three six e minus zero six";
      // the spoken form is written out in the script instead.
      expect(text, scene).not.toMatch(/\d[eE][+-]?\d/);
      expect(text.length, `${scene} is too long for one clip`).toBeLessThan(1500);
    }
  });
});

describe('the narration says what the picture says', () => {
  it('speaks the manuscript’s result, not a rounded version of it', async () => {
    const { result } = await import('./data');
    expect(NARRATION.trace).toContain(result.value);
    // The uncertainty is spoken as words; the digits on screen are the record's.
    expect(result.uncertainty).toBe('0.00000336');
    expect(NARRATION.trace).toContain('three point three six times ten to the minus six');
  });

  it('counts the records, gates and findings from the data layer', async () => {
    const { cfdRecord, chain, council, gateCount, stages, submission } = await import('./data');
    // Spoken as words, so the assertions compare words: `spoken()` is the same
    // function the script uses, which is what makes this a check on the data
    // rather than a check on a string someone typed twice.
    expect(NARRATION.trace).toContain(spoken(cfdRecord.seq));
    expect(NARRATION.evidence).toContain(`${spoken(chain.length)} links long`);
    expect(NARRATION.title).toContain(`${spoken(stages.length)} gated stages`);
    expect(NARRATION.title).toContain(`${spoken(gateCount)} human`);
    expect(NARRATION.pipeline).toContain(
      `${spoken(stages.length)} stages and ${spoken(gateCount)} checkpoints`,
    );
    expect(NARRATION.review).toContain(spoken(council.checks.length));
    expect(NARRATION.review).toContain(council.verdict);
    expect(NARRATION.review).toContain(spoken(council.major));
    expect(NARRATION.review).toContain(spoken(submission.blockers.length));
  });

  it('says the solver is synthetic instead of implying a simulation', async () => {
    const { cfd } = await import('./data');
    expect(cfd.solver).toBe('synthetic');
    expect(NARRATION.limits).toContain(`${cfd.solver} solver`);
    expect(NARRATION.limits).toContain('no Navier-Stokes equation was solved');
  });
});
