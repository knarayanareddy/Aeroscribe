import researchLab from '../assets/research-lab.jpg';
import { site } from '../config/site';

const tags = ['Open source', 'Human-gated', 'Evidence-first', 'Early prototype'];

const buildStatus = [
  { label: 'Landing site', value: 'Implemented', dot: 'bg-emerald-400' },
  { label: 'Researcher dashboard', value: 'Fixture data', dot: 'bg-amber-400' },
  { label: 'Agent API', value: 'Implemented', dot: 'bg-emerald-400' },
  { label: 'API ↔ dashboard', value: 'Not wired', dot: 'bg-amber-400' },
];

export default function About() {
  return (
    <section id="about" className="relative overflow-hidden py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/20 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-blue-400">
              About AeroScribe
            </p>
            <h2 className="mb-6 bg-gradient-to-r from-white to-blue-200 bg-clip-text font-display text-4xl font-bold leading-tight text-transparent md:text-5xl">
              Research rigour, automated — and auditable
            </h2>

            <div className="mb-8 space-y-4 font-grotesk text-lg leading-relaxed text-gray-400">
              <p>
                AeroScribe is an early-stage, open-source prototype of an autonomous aerospace
                research pipeline. The goal is narrow and concrete: take a research question to a
                submission-ready manuscript while keeping every quantitative claim traceable to a
                reproducible computation.
              </p>
              <p>
                That means human decision gates at every stage, a checksummed evidence registry, and
                a hard rule against fabricated numbers. The agent runtime lives in{' '}
                <span className="font-mono text-sm text-blue-200">services/api</span>: nine stage
                handlers, Crossref/arXiv/Semantic Scholar clients, a SU2 adapter with grid
                convergence checks, and an append-only hash chain that every generated number is
                verified against. The dashboard is still a fixture-data prototype and the{' '}
                <a
                  href={`${site.repoUrl}/blob/main/docs/BACKEND.md`}
                  className="text-blue-300 underline decoration-blue-500/40 underline-offset-4 hover:text-white"
                >
                  backend map
                </a>{' '}
                states exactly what is real.
              </p>
            </div>

            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 font-grotesk text-sm text-blue-200"
                >
                  {tag}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-3xl border border-blue-500/20 shadow-2xl shadow-blue-900/30">
              <img
                src={researchLab}
                alt="Engineers working in a computational research laboratory"
                loading="lazy"
                className="h-80 w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />
            </div>

            <div className="absolute -bottom-6 -left-4 rounded-2xl border border-blue-500/30 bg-[#0a1628]/95 p-5 shadow-xl backdrop-blur-xl sm:-left-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <span className="font-grotesk text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Prototype status
                </span>
              </div>
              <ul className="space-y-2">
                {buildStatus.map((item) => (
                  <li key={item.label} className="flex items-center gap-3">
                    <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} aria-hidden="true" />
                    <span className="font-grotesk text-xs text-gray-400">{item.label}</span>
                    <span className="ml-auto font-grotesk text-xs font-semibold text-gray-200">
                      {item.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
