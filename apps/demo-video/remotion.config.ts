import { Config } from '@remotion/cli/config';

/**
 * Render defaults, kept in one place so `npm run render` and the CLI produce
 * the same file.
 *
 * The audio is the narration clips in `public/narration/`, placed on the
 * timeline by `AeroScribeDemo`. AAC at 160 kbps is well past transparent for a
 * mono voice track and keeps the file small.
 */
// PNG frames, not JPEG ones: Remotion's encoder writes full-range `yuvj420p`
// from JPEG input, which some players and every video pipeline downstream treat
// as a different colour space. `--image-format=png` is what produces a plain
// `yuv420p` file, and the extra render time is a few minutes once.
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(23);
Config.setConcurrency(2);
Config.setAudioCodec('aac');
Config.setAudioBitrate('160k');
