/**
 * How long an MP3 actually is, without shelling out to ffprobe.
 *
 * The timeline is built from `NARRATION_SECONDS`, and that constant is a
 * measurement someone takes by hand after recording. Hand-taken measurements
 * rot: re-record a line, forget the number, and the voice runs into the next
 * scene with nothing in CI to notice. So the test suite measures the committed
 * clips and compares — which needs a duration, and cannot depend on an ffprobe
 * binary the runners do not have.
 *
 * This reads MPEG audio frame headers and adds up frame durations. It handles
 * what the voice clips are: MPEG-1 Layer III, constant or variable bitrate,
 * optionally behind an ID3v2 tag. Anything else throws rather than guessing a
 * duration, because a wrong duration here is a scene that cuts mid-sentence.
 */

/** Samples per frame: MPEG-1 Layer III is 1152, MPEG-2/2.5 is 576. */
const SAMPLES_PER_FRAME = { 1: 1152, 2: 576, 2.5: 576 } as const;

/** kbps by [version][layer][bitrate index], for the rates a voice clip can use. */
const BITRATES: Record<number, Record<number, readonly number[]>> = {
  1: {
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  },
  2: {
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  },
};

const SAMPLE_RATES: Record<number, readonly number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};

interface FrameHeader {
  version: 1 | 2 | 2.5;
  layer: number;
  bitrateKbps: number;
  sampleRate: number;
  padding: 0 | 1;
  length: number;
}

function readHeader(bytes: Uint8Array, at: number): FrameHeader | null {
  if (at + 4 > bytes.length) return null;
  // 11 bits of sync; a frame cannot start with anything else.
  if (bytes[at] !== 0xff || (bytes[at + 1]! & 0xe0) !== 0xe0) return null;

  const versionBits = (bytes[at + 1]! >> 3) & 0b11;
  const layerBits = (bytes[at + 1]! >> 1) & 0b11;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : versionBits === 0 ? 2.5 : null;
  const layer = 4 - layerBits;
  if (version === null || layer !== 3) return null;

  const bitrateIndex = (bytes[at + 2]! >> 4) & 0b1111;
  const sampleRateIndex = (bytes[at + 2]! >> 2) & 0b11;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;

  const bitrateKbps = BITRATES[version === 1 ? 1 : 2]?.[3]?.[bitrateIndex];
  const sampleRate = SAMPLE_RATES[version]?.[sampleRateIndex];
  if (!bitrateKbps || !sampleRate) return null;

  const padding = ((bytes[at + 2]! >> 1) & 1) as 0 | 1;
  const samplesPerFrame = SAMPLES_PER_FRAME[version];
  const length = Math.floor((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate + padding;

  return { version, layer, bitrateKbps, sampleRate, padding, length: Math.floor(length) };
}

/**
 * Duration in seconds, to the millisecond.
 *
 * Walks the frames rather than reading a `TLEN` tag: the tag is written by
 * whoever encoded the file, and this is meant to check that, not trust it.
 */
export function mp3DurationSeconds(bytes: Uint8Array): number {
  let offset = 0;

  // ID3v2 tags are length-prefixed with syncsafe integers (7 bits per byte).
  if (bytes.length > 10 && String.fromCharCode(...bytes.slice(0, 3)) === 'ID3') {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    offset = 10 + size;
  }

  let seconds = 0;
  let frames = 0;

  while (offset < bytes.length) {
    const header = readHeader(bytes, offset);
    if (!header) {
      // A trailing ID3v1 tag is 128 bytes of "TAG…" and carries no audio.
      const rest = bytes.length - offset;
      if (rest <= 128) break;
      throw new Error(`no MPEG frame at byte ${String(offset)} of ${String(bytes.length)}`);
    }
    seconds += SAMPLES_PER_FRAME[header.version] / header.sampleRate;
    offset += header.length;
    frames += 1;
  }

  if (frames === 0) throw new Error('the file contains no MPEG audio frames');
  return seconds;
}
