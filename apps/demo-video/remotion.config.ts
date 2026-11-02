import { Config } from '@remotion/cli/config';

/**
 * Render defaults, kept in one place so `npm run render` and the CLI produce
 * the same file. The video is silent by construction: every scene is a React
 * component and there is no audio track to sync.
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
