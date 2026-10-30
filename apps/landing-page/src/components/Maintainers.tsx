import { site } from '../config/site';

export default function Maintainers() {
  return (
    <section id="team" className="relative overflow-hidden py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-emerald-400">
            Maintainers
          </p>
          <h2 className="mb-4 bg-gradient-to-r from-white to-emerald-200 bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
            Built in the open
          </h2>
          <p className="mx-auto max-w-2xl font-grotesk text-lg text-gray-400">
            AeroScribe is maintained by one engineer and open to contributors. Every name on this
            page belongs to a real person who has agreed to be listed.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl border border-white/5 bg-white/[0.03] p-7">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 font-display text-lg font-bold text-white">
                KNR
              </div>
              <div>
                <h3 className="font-grotesk text-lg font-semibold text-white">K. Narayana Reddy</h3>
                <p className="font-grotesk text-sm text-gray-400">Maintainer</p>
              </div>
            </div>
            <p className="font-grotesk text-sm leading-relaxed text-gray-400">
              Owns the repository: the researcher dashboard, the pipeline specification and the
              integrity rules. Reviewing pull requests and answering issues is the fastest way to
              shape the project.
            </p>
            <a
              href={site.repoUrl}
              className="mt-5 inline-flex items-center gap-2 font-grotesk text-sm font-medium text-emerald-300 transition-colors hover:text-white"
            >
              github.com/knarayanareddy/Aeroscribe <span aria-hidden="true">→</span>
            </a>
          </article>

          <article className="rounded-3xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-7">
            <h3 className="mb-3 font-grotesk text-lg font-semibold text-white">
              Your name could go here
            </h3>
            <p className="mb-5 font-grotesk text-sm leading-relaxed text-gray-400">
              The most useful contributions right now: a CFD evidence adapter, a LaTeX renderer, or
              tests for the pipeline state machine. Everything is MIT licensed.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`${site.repoUrl}/blob/main/CONTRIBUTING.md`}
                className="rounded-full bg-emerald-500/20 px-4 py-2 font-grotesk text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/30"
              >
                Contributing guide
              </a>
              <a
                href={site.issuesUrl}
                className="rounded-full border border-emerald-500/30 px-4 py-2 font-grotesk text-sm font-semibold text-emerald-200 transition-colors hover:border-emerald-400"
              >
                Open issues
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
