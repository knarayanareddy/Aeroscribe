import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * The four faces the video uses, loaded from `public/fonts/`.
 *
 * They are the same families the landing page self-hosts (`@fontsource`), so
 * the video looks like the product rather than like a default browser page.
 * `delayRender` is what makes this safe: Remotion will not capture a frame
 * until every face has loaded, so no frame can show a fallback font and jump.
 *
 * The files are copied into `public/` instead of imported from `node_modules`
 * because a Remotion bundle resolves `staticFile()` against `public/` only —
 * importing a package asset would work in the Studio and 404 in a render.
 */
const faces: Array<{ family: string; weight: string; file: string }> = [
  { family: 'Inter', weight: '400', file: 'inter-latin-400-normal.woff2' },
  { family: 'Inter', weight: '500', file: 'inter-latin-500-normal.woff2' },
  { family: 'Inter', weight: '600', file: 'inter-latin-600-normal.woff2' },
  { family: 'Space Grotesk', weight: '600', file: 'space-grotesk-latin-600-normal.woff2' },
  { family: 'Orbitron', weight: '500', file: 'orbitron-latin-500-normal.woff2' },
  { family: 'Orbitron', weight: '700', file: 'orbitron-latin-700-normal.woff2' },
];

const handle = delayRender('Loading the self-hosted fonts');

export const fontsReady: Promise<void> = Promise.all(
  faces.map(async ({ family, weight, file }) => {
    const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, {
      weight,
      style: 'normal',
      display: 'block',
    });
    await face.load();
    document.fonts.add(face);
  }),
)
  // A font that will not load is a broken render, not a broken video: the
  // frames still render with the fallback stack, so the run finishes and the
  // mistake is visible on the first still rather than as a hung `delayRender`.
  .then(
    () => undefined,
    (error: unknown) => {
      console.error('font load failed; rendering with the fallback stack', error);
    },
  )
  .finally(() => continueRender(handle));
