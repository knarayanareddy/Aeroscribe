import { GATE_CHECKPOINT_COUNT, STAGE_COUNT } from '@aeroscribe/pipeline';
import heroBackground from '../assets/hero-bg.jpg';
import { site } from '../config/site';
import ParticleField from './ParticleField';

const stats = [
  { value: String(STAGE_COUNT), label: 'Pipeline stages' },
  { value: String(GATE_CHECKPOINT_COUNT), label: 'Specified gate checkpoints' },
  { value: 'SHA-256', label: 'Evidence checksums' },
  { value: 'MIT', label: 'Open source' },
];

export default function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <img
        src={heroBackground}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/60 to-ink" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(59,130,246,0.15),transparent)]" />

      <ParticleField className="absolute inset-0 z-10 h-full w-full" />

      <div className="relative z-20 mx-auto max-w-6xl px-4 pt-24 text-center">
        <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-1.5 font-grotesk text-sm font-medium text-blue-300 backdrop-blur-sm">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
          </span>
          Open prototype · illustrative data
        </p>

        <h1 className="mb-6 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="block animate-rise bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-transparent">
            Autonomous aerospace research,
          </span>
          <span
            className="block animate-rise bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent"
            style={{ animationDelay: '120ms' }}
          >
            one auditable pipeline
          </span>
        </h1>

        <p className="mx-auto mb-6 max-w-2xl font-grotesk text-lg leading-relaxed text-gray-300 sm:text-xl">
          AeroScribe moves an aerospace research question through nine gated stages — literature
          archaeology, novelty detection, CFD evidence, peer review, manuscript synthesis — without
          ever inventing a number.
        </p>

        <p className="mx-auto mb-10 max-w-2xl font-grotesk text-sm text-gray-400">
          Status: the researcher dashboard and this site are implemented. The agent backend is
          specified in <span className="font-mono text-gray-300">/specs</span> and is not running
          yet.
        </p>

        <div className="mb-16 flex flex-col justify-center gap-4 sm:flex-row">
          <a
            href="#how-it-works"
            className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-4 font-grotesk text-base font-semibold text-white shadow-xl shadow-blue-900/40 transition-all hover:-translate-y-0.5 hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-700/60"
          >
            Explore the pipeline →
          </a>
          <a
            href={site.dashboardUrl}
            className="rounded-full border border-blue-500/40 bg-blue-500/10 px-8 py-4 font-grotesk text-base font-semibold text-blue-300 backdrop-blur-sm transition-all hover:border-blue-400 hover:bg-blue-500/20 hover:text-white"
          >
            Open the dashboard
          </a>
        </div>

        <dl className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 backdrop-blur-sm"
            >
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="mb-1 block bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text font-display text-3xl font-bold text-transparent">
                  {stat.value}
                </span>
                <span className="block font-grotesk text-xs font-medium text-gray-400">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 text-gray-500">
        <span className="font-grotesk text-xs uppercase tracking-widest">Scroll</span>
        <div className="h-12 w-px bg-gradient-to-b from-blue-500/60 to-transparent motion-safe:animate-pulse" />
      </div>
    </section>
  );
}
