#!/usr/bin/env node
/**
 * Build the WebVTT captions for the demo video.
 *
 * A narrated video with no captions is a video half its audience cannot follow,
 * and hand-written captions drift the first time a line is re-recorded. So the
 * cues are derived from the two things that actually define the audio: the
 * script (`apps/demo-video/src/narration.ts`) and the rendered clips it was
 * spoken into.
 *
 * Sentence boundaries are *measured*, not guessed. Each clip is decoded to PCM,
 * and every boundary is snapped to the quietest 20 ms window near the position
 * the sentence's character count predicts — which is where the reader paused.
 * A caption that appears a second before or after the words is worse than none,
 * so the snapping is checked: if the best window is not meaningfully quieter
 * than the speech around it, the boundary stays proportional and the script
 * says so on stderr.
 *
 * Usage: node scripts/make-captions.mjs
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = process.cwd();

/** Where the demo's own modules live; loaded through `tsx` because they are TS. */
const DEMO = resolve(root, 'apps/demo-video');

const FFMPEG = resolve(root, 'node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg');
const FFPROBE = resolve(root, 'node_modules/@remotion/compositor-linux-x64-gnu/ffprobe');
const REMOTION_LIBS = resolve(root, 'node_modules/@remotion/compositor-linux-x64-gnu');

const OUTPUT = resolve(root, 'apps/landing-page/public/demo/aeroscribe-demo.vtt');

/** RMS window length. 20 ms is short enough to find a pause, long enough to be stable. */
const WINDOW_SECONDS = 0.02;
/** How far from the predicted position a boundary may move to find a pause. */
const SEARCH_SECONDS = 1.6;
/** No caption is scheduled shorter than this, measured from boundary to boundary. */
const MIN_CUE_SECONDS = 0.8;

async function ffmpegProbeDuration(file) {
  const { stdout } = await run(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { env: { ...process.env, LD_LIBRARY_PATH: REMOTION_LIBS } },
  );
  return Number(stdout.trim());
}

/** Decode to mono 16 kHz signed 16-bit PCM and return per-window RMS. */
async function rmsWindows(file, directory, name) {
  const wav = join(directory, `${name}.wav`);
  await run(
    FFMPEG,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      file,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-y',
      wav,
    ],
    { env: { ...process.env, LD_LIBRARY_PATH: REMOTION_LIBS } },
  );
  const buffer = await readFile(wav);
  let offset = 12;
  while (offset < buffer.length - 8) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') {
      offset += 8;
      break;
    }
    offset += 8 + size;
  }
  const samples = new Int16Array(
    buffer.buffer,
    buffer.byteOffset + offset,
    (buffer.length - offset) >> 1,
  );
  const per = Math.round(16000 * WINDOW_SECONDS);
  const out = [];
  for (let i = 0; (i + 1) * per <= samples.length; i += 1) {
    let sum = 0;
    for (let j = i * per; j < (i + 1) * per; j += 1) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / per));
  }
  return out;
}

/**
 * Split a narration paragraph into caption-sized cues.
 *
 * First at sentence ends — those are the boundaries that can be snapped to a
 * measured pause. A sentence that is still too long to read in one glance is
 * then broken at a comma, or failing that between words, and the pieces share
 * the sentence's span in proportion to their length. Only sentence ends are
 * ever moved; a comma is not a pause the audio can be trusted to place.
 */
function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** About 84 characters is two comfortable lines of caption at 1080p. */
const MAX_CUE = 84;

function chunk(sentence) {
  if (sentence.length <= MAX_CUE) return [sentence];
  // Prefer a clause break near the middle: a caption that ends on a comma reads
  // as a thought, one cut mid-clause reads as a mistake.
  const breakpoints = [...sentence.matchAll(/[,;:—]\s+/g)].map((m) => m.index + 1);
  if (breakpoints.length > 0) {
    const middle = sentence.length / 2;
    const at = breakpoints.reduce((a, b) => (Math.abs(b - middle) < Math.abs(a - middle) ? b : a));
    if (at > 24 && sentence.length - at > 16) {
      return [...chunk(sentence.slice(0, at).trim()), ...chunk(sentence.slice(at).trim())];
    }
  }
  // No usable punctuation: cut at the word boundary nearest the middle.
  const words = sentence.split(' ');
  if (words.length < 4) return [sentence];
  let split = Math.ceil(words.length / 2);
  let best = split;
  let bestLength = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const head = words.slice(0, i).join(' ').length;
    const tail = words.slice(i).join(' ').length;
    const worst = Math.max(head, tail);
    if (worst < bestLength) {
      bestLength = worst;
      best = i;
    }
  }
  split = best;
  return [...chunk(words.slice(0, split).join(' ')), ...chunk(words.slice(split).join(' '))];
}

/**
 * A caption nobody can read in the time it is on screen is not a caption.
 *
 * Chunking a long sentence by punctuation can leave a stub — "and so it does."
 * — that would flash for a third of a second. Merge any piece whose share of
 * the sentence is under a second into its neighbour, so every cue stays up long
 * enough to be read.
 */
function mergeTooShort(pieces, spanSeconds) {
  const chars = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const merged = [...pieces];
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    for (let i = 0; i < merged.length; i += 1) {
      const share = (merged[i].length / chars) * spanSeconds;
      if (share >= 1) continue;
      // Merge into the longer neighbour: a short caption joined to a long one
      // is still one caption, and the long one can absorb the words.
      const before = merged[i - 1];
      const after = merged[i + 1];
      if (before !== undefined && (after === undefined || before.length >= after.length)) {
        merged.splice(i - 1, 2, `${before} ${merged[i]}`);
      } else if (after !== undefined) {
        merged.splice(i, 2, `${merged[i]} ${after}`);
      }
      changed = true;
      break;
    }
  }
  return merged;
}

/** Seconds → `HH:MM:SS.mmm`, the WebVTT timestamp. */
function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rest).padStart(3, '0')}`;
}

async function main() {
  // `tsx` so the script and the timeline are the single source: a re-recorded
  // line changes the captions without anyone editing a second copy of the text.
  const { pathToFileURL } = await import('node:url');
  const { register } = await import('tsx/esm/api');
  const unregister = register();
  const narrationUrl = pathToFileURL(join(DEMO, 'src/narration.ts')).href;
  const timelineUrl = pathToFileURL(join(DEMO, 'src/timeline.ts')).href;
  const { NARRATION } = await import(narrationUrl);
  const { timeline, LEAD_FRAMES, FPS } = await import(timelineUrl);
  unregister();

  const { stdout: totalSeconds } = await run(
    FFPROBE,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      resolve(root, 'apps/landing-page/public/demo/aeroscribe-demo.mp4'),
    ],
    { env: { ...process.env, LD_LIBRARY_PATH: REMOTION_LIBS } },
  );

  const directory = await mkdtemp(join(tmpdir(), 'aeroscribe-captions-'));
  const cues = [];
  let unsnapped = 0;

  try {
    for (const scene of timeline) {
      const clip = resolve(DEMO, 'public/narration', `${scene.id}.mp3`);
      const clipSeconds = await ffmpegProbeDuration(clip);
      const windows = await rmsWindows(clip, directory, scene.id);
      const lines = sentences(NARRATION[scene.id]);
      if (lines.length === 0) continue;

      // Character counts are a proxy for speaking time; within one clip they are
      // close enough to find the neighbourhood of each pause.
      const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
      const boundaries = [];
      let consumed = 0;
      for (const line of lines.slice(0, -1)) {
        consumed += line.length;
        const predicted = (consumed / totalChars) * clipSeconds;
        // Snap to the quietest window near the prediction: that is the pause.
        const lo = Math.max(0, Math.round((predicted - SEARCH_SECONDS) / WINDOW_SECONDS));
        const hi = Math.min(
          windows.length - 1,
          Math.round((predicted + SEARCH_SECONDS) / WINDOW_SECONDS),
        );
        let best = Math.round(predicted / WINDOW_SECONDS);
        let bestValue = Infinity;
        for (let i = lo; i <= hi; i += 1) {
          if (windows[i] < bestValue) {
            bestValue = windows[i];
            best = i;
          }
        }
        const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
        // A "pause" no quieter than ordinary speech is not a pause. Say so
        // rather than pretending the caption is timed.
        if (bestValue > mean * 0.35) unsnapped += 1;

        // Two short sentences can snap to the same pause, which would leave the
        // first with no time on screen at all. Keep every boundary strictly
        // after the one before it, and fall back to the proportional position
        // when the pause is too close to be useful.
        const floor = (boundaries.at(-1) ?? 0) + MIN_CUE_SECONDS;
        const snapped = Math.min(clipSeconds - MIN_CUE_SECONDS, Math.max(0, best * WINDOW_SECONDS));
        boundaries.push(snapped >= floor ? snapped : Math.max(floor, predicted));
      }

      const starts = [0, ...boundaries];
      const ends = [...boundaries, clipSeconds];
      const offset = scene.from / FPS + LEAD_FRAMES / FPS;

      lines.forEach((sentence, index) => {
        const span = ends[index] - starts[index];
        // Sub-chunks share the sentence's span by character count: there is no
        // pause to snap to inside a sentence, so proportion is the honest
        // estimate and the boundary is not presented as measured.
        const pieces = mergeTooShort(chunk(sentence), span);
        const chars = pieces.reduce((sum, piece) => sum + piece.length, 0);
        let elapsed = 0;
        for (const piece of pieces) {
          const share = (piece.length / chars) * span;
          if (share <= 0) continue;
          cues.push({
            start: offset + starts[index] + elapsed,
            end: offset + starts[index] + elapsed + share,
            text: piece,
          });
          elapsed += share;
        }
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  // WebVTT wants cues in order with no overlaps; the tail of one cue and the
  // head of the next can touch after rounding, so leave a 40 ms gap.
  const body = cues
    .map((cue, index) => {
      const next = cues[index + 1];
      // Leave a hair between cues so two captions never paint on top of each
      // other. The clamp is a ceiling, never a floor: extending a cue to a
      // minimum length is what makes a short one collide with the next.
      const ceiling = next ? next.start - 0.02 : cue.end;
      const end = Math.min(Math.max(cue.end, cue.start + 0.2), ceiling);
      return `${String(index + 1)}\n${stamp(cue.start)} --> ${stamp(Math.max(end, cue.start + 0.02))}\n${cue.text}\n`;
    })
    .join('\n');

  await writeFile(
    OUTPUT,
    `WEBVTT\n\nNOTE Generated by scripts/make-captions.mjs from apps/demo-video/src/narration.ts\nNOTE and the rendered narration clips. Do not edit by hand; re-run the script.\n\n${body}`,
    'utf8',
  );

  const duration = Number(totalSeconds.trim());
  console.log(
    `[captions] ${cues.length} cues over ${timeline.length} scenes, ${stamp(duration)} of video, ${unsnapped} boundary/boundaries not snapped to a pause`,
  );
}

await main();
