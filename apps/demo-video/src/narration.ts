import {
  cfd,
  cfdRecord,
  chain,
  council,
  gateCount,
  mesh,
  result,
  stages,
  submission,
} from './data';
import type { SceneId } from './timeline';

/**
 * What the video says out loud, scene by scene.
 *
 * The same rule the scenes follow applies here and is easier to break: a
 * voiceover is read once, never diffed, and sounds authoritative whatever it
 * claims. So every figure below is interpolated from `data.ts` — the recorded
 * run — and nothing is spelled out as a literal that could drift from the
 * evidence. Change the fixture and the narration changes with it; delete a
 * record and this file stops compiling.
 *
 * Two writing constraints that are about the ear rather than the screen:
 *
 * - Counts are spoken as words (`spoken`), because a TTS engine reads "11" as
 *   "eleven" but "9" in a list can land as "niner" against a voice's prosody.
 * - Numbers are written the way they should be said, not the way they are
 *   printed: `3.36 times 10 to the minus 6` rather than `3.36e-06`, which more
 *   than one engine reads as "three point three six e minus zero six".
 */
export const NARRATION: Record<SceneId, string> = {
  title:
    `This is AeroScribe, an open prototype of an autonomous aerospace research ` +
    `pipeline: ${spoken(stages.length)} gated stages and ${spoken(gateCount)} human ` +
    `checkpoints, from a literature search to a submission package. This video ` +
    `follows one real run, including the parts that went wrong.`,

  trace:
    `It starts with one sentence in the manuscript. The extrapolated drag ` +
    `coefficient is ${result.value}, give or take three point three six times ` +
    `ten to the minus six. That number was not typed. It comes from evidence ` +
    `record ${spoken(cfdRecord.seq)}, a CFD study over ${spoken(mesh.length)} ` +
    `meshes, and the record is sealed with a digest of its own payload.`,

  pipeline:
    `The pipeline is ${spoken(stages.length)} stages and ${spoken(gateCount)} ` +
    `checkpoints. Nothing advances on its own: each stage writes its evidence, ` +
    `opens a gate, and waits for a person. The CFD stage alone holds three.`,

  evidence:
    `Every stage appends exactly one record, and every record commits to the one ` +
    `before it. That makes the registry a hash chain, ${spoken(chain.length)} links ` +
    `long in this run. Re-walking it re-hashes every payload, and the API refuses ` +
    `a record that does not extend the chain.`,

  plan:
    `Before it writes a word, stage five writes a plan: one paragraph per job, ` +
    `and the numbers each paragraph is allowed to print. Stage six then compares ` +
    `the text against the plan. In this run it caught a paragraph printing a ` +
    `number the plan never declared.`,

  citations:
    `Citations are set from structured records, then read back to prove nothing ` +
    `was dropped. This reference carries no issue number, so the formatter omits ` +
    `it and says so, rather than inventing a volume that reads well.`,

  figure:
    `The figure is text you can diff: two LaTeX plot panels and a data file, ` +
    `written straight from the grid study. No screenshot of a plot. A reviewer ` +
    `reads the numbers LaTeX will draw.`,

  review:
    `Then the review council: ${spoken(council.checks.length)} checks with stated ` +
    `rule ids. This run came back ${council.verdict}, with ` +
    `${spoken(council.major)} major findings, and stage eight recorded ` +
    `${spoken(submission.blockers.length)} blockers in its own words. The ` +
    `manuscript is real. It is just not submittable.`,

  limits:
    `Three things this does not claim. The CFD numbers come from a ` +
    `${cfd.solver} solver: no Navier-Stokes equation was solved. There is LaTeX ` +
    `source and no PDF, because no typesetting engine was configured. And the ` +
    `published dashboard renders fixtures, not a live API.`,

  outro:
    `AeroScribe is MIT licensed, and the site and the source are linked below. ` +
    `Every number you just heard was read from one recorded run: the same capture ` +
    `the dashboard's tests replay against.`,
};

/** A small count, written out, so the voice does not read a list item as a digit. */
export function spoken(count: number): string {
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ];
  return words[count] ?? String(count);
}

/**
 * How long each clip runs, in seconds.
 *
 * Measured from the committed MP3s with `mp3DurationSeconds` (the same parser
 * `narration.test.ts` uses to check them), not estimated from the word count:
 * the cut is derived from these, so a wrong number here is a scene that starts
 * talking over the one before it. If you re-record, run the suite — it fails on
 * the mismatch rather than letting the video drift.
 *
 * The voice is synthesised. Say so wherever the video is published.
 */
export const NARRATION_SECONDS: Record<SceneId, number> = {
  title: 15.53,
  trace: 20.14,
  pipeline: 11.35,
  evidence: 15.74,
  plan: 15.82,
  citations: 13.25,
  figure: 11.23,
  review: 16.22,
  limits: 16.1,
  outro: 11.83,
};

/** Where a scene's clip lives, under `public/` so `staticFile()` can resolve it. */
export function narrationFile(scene: SceneId): string {
  return `narration/${scene}.mp3`;
}
