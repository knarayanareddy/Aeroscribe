import { useRef, useState } from 'react';
import { site } from '../config/site';

/**
 * The demo video, played from the site itself.
 *
 * Two decisions worth stating, because both are about honesty rather than
 * taste:
 *
 * 1. **Nothing is fetched until the visitor asks.** The file is 8.8 MB, and a
 *    landing page that downloads that on load is a page that punishes a phone
 *    on a train. `preload="none"` plus a poster frame means the cost is paid by
 *    the people who actually watch it.
 * 2. **The synthesised voice is labelled on the page.** A voiceover that sounds
 *    like a person reads as a person unless the page says otherwise, and this
 *    site's whole argument is that claims get labelled.
 */
export default function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  function play() {
    setStarted(true);
    const element = videoRef.current;
    if (!element) return;
    // `play()` rejects when the browser blocks autoplay or the codec is
    // unsupported. Either way the controls stay available, which matters more
    // than the click doing nothing visible.
    void element.play().catch(() => setStarted(false));
  }

  return (
    <section id="demo" className="relative overflow-hidden py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-violet-400">
            Demo
          </p>
          <h2 className="mb-4 bg-gradient-to-r from-white to-violet-200 bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
            Two and a half minutes, one real run
          </h2>
          <p className="mx-auto max-w-2xl font-grotesk text-lg text-gray-400">
            The pipeline taken through a single recorded run: a number traced back to its evidence,
            the hash chain that seals it, the review that refused to pass it, and the three things
            this run does not claim. Rendered from React components, not screen-recorded.
          </p>
        </div>

        <figure className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-2xl border border-violet-500/25 bg-black shadow-2xl shadow-violet-950/50">
            {!started ? (
              <button
                type="button"
                onClick={play}
                className="group absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/10"
                aria-label="Play the AeroScribe demo video"
              >
                {/*
                  Sits low in the frame on purpose: the poster is the video's
                  own title card, and a centred button lands on the wordmark's
                  supporting line. Low-left keeps the brand readable and still
                  reads as the obvious thing to click.
                */}
                <span className="absolute bottom-6 left-6 flex items-center gap-3 rounded-full border border-white/25 bg-black/70 py-3 pl-3 pr-6 backdrop-blur-sm transition-transform group-hover:scale-[1.03]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-ink" aria-hidden="true">
                      <path d="M8 5v14l11-7L8 5Z" />
                    </svg>
                  </span>
                  <span className="font-grotesk text-sm font-semibold text-white">
                    Play · 2:34 · captions on
                  </span>
                </span>
              </button>
            ) : null}

            <video
              ref={videoRef}
              className="block aspect-video w-full [&::cue]:text-[1.1vw] [&::cue]:leading-snug"
              poster={site.demoPosterUrl}
              preload="none"
              controls
              playsInline
              onError={() => setFailed(true)}
            >
              <source src={site.demoVideoUrl} type="video/mp4" />
              <track
                kind="captions"
                src={site.demoCaptionsUrl}
                srcLang="en"
                label="English"
                default
              />
              {/*
                A browser that cannot play the file gets this instead of a
                black rectangle. It links the same file rather than pretending
                the video is unavailable.
              */}
              <p className="p-8 text-center text-sm text-gray-300">
                Your browser cannot play the embedded video.{' '}
                <a href={site.demoVideoUrl} className="text-blue-300 underline">
                  Download it instead
                </a>{' '}
                (8.4 MB, MP4).
              </p>
            </video>
          </div>

          {failed ? (
            <p className="mt-4 text-center font-grotesk text-sm text-amber-300">
              The video failed to load.{' '}
              <a href={site.demoVideoUrl} className="underline">
                Download it here
              </a>
              .
            </p>
          ) : null}

          <figcaption className="mt-5 flex flex-col items-center gap-2 text-center font-grotesk text-sm text-gray-500">
            <span>
              2:34 · 1080p · captions included ·{' '}
              <a
                href={site.demoVideoUrl}
                download
                className="text-blue-300 underline decoration-blue-500/40 underline-offset-4 hover:text-white"
              >
                download the MP4
              </a>
            </span>
            <span className="max-w-2xl text-xs text-gray-500">
              The narration is <strong className="font-semibold text-gray-400">synthesised</strong>,
              not a human voice. Every figure it speaks — and every figure on screen — is read from
              the same recorded pipeline run the dashboard&apos;s tests replay, including the parts
              that failed.
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
