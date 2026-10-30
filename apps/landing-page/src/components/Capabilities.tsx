type CapabilityStatus = 'implemented' | 'prototype' | 'specified';

interface Capability {
  title: string;
  description: string;
  status: CapabilityStatus;
  icon: string;
}

const capabilities: readonly Capability[] = [
  {
    title: 'Autonomous agent orchestration',
    description:
      'One orchestrator runs nine stage handlers in order, stops at every human gate, records an audit entry for each state change and refuses to advance past an unapproved gate. Real code in services/api, exercised end to end by the test suite.',
    status: 'implemented',
    icon: '🧠',
  },
  {
    title: 'Literature archaeology',
    description:
      'Crossref, arXiv and Semantic Scholar clients with DOI resolution, per-provider error reporting, exponential backoff and politeness limits. A reference is citable only after a DOI registry returned it for this run.',
    status: 'implemented',
    icon: '📚',
  },
  {
    title: 'Uncertainty-first evidence',
    description:
      'A real SU2 adapter runs three meshes and a Roache grid-convergence study checks the observed order and the asymptotic range before any value is quoted. Without a solver, the deterministic synthetic benchmark is labelled and blocks submission.',
    status: 'implemented',
    icon: '🔐',
  },
  {
    title: 'Traceable numbers',
    description:
      'Every value and DOI in a generated manuscript is re-verified against an append-only, hash-chained evidence registry. One unbacked number and the writing stage refuses to produce the manuscript.',
    status: 'implemented',
    icon: '🔍',
  },
  {
    title: 'Peer-review council',
    description:
      'Six deterministic checks with stated rule ids — claim tracing, DOI resolution, abstract length, reference count, AI disclosure and GCI validity. Any major comment blocks submission; nothing is scored by a language model.',
    status: 'implemented',
    icon: '🧪',
  },
  {
    title: 'Journal calibration',
    description:
      'Per-journal profiles (scope, abstract limits, citation style, LaTeX template) drive compliance checks for AIAA, Elsevier and Acta Astronautica targets.',
    status: 'prototype',
    icon: '🎯',
  },
];

const statusStyles: Record<CapabilityStatus, string> = {
  implemented: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  prototype: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  specified: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
};

const statusLabels: Record<CapabilityStatus, string> = {
  implemented: 'In services/api',
  prototype: 'In dashboard',
  specified: 'Specified',
};

export default function Capabilities() {
  return (
    <section id="capabilities" className="relative overflow-hidden py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-violet-400">
            Core Capabilities
          </p>
          <h2 className="mb-4 bg-gradient-to-r from-white to-violet-200 bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
            What the pipeline is built to do
          </h2>
          <p className="mx-auto max-w-2xl font-grotesk text-lg text-gray-400">
            Each card is labelled with what actually exists today: code running in the API, pieces
            rendered by the fixture-data dashboard, and anything still specified only.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability) => (
            <li
              key={capability.title}
              className="group rounded-3xl border border-white/5 bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/20 hover:bg-white/[0.06]"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {capability.icon}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 font-grotesk text-[11px] font-semibold uppercase tracking-wide ${statusStyles[capability.status]}`}
                >
                  {statusLabels[capability.status]}
                </span>
              </div>
              <h3 className="mb-2 font-grotesk text-lg font-semibold text-white">
                {capability.title}
              </h3>
              <p className="font-grotesk text-sm leading-relaxed text-gray-400">
                {capability.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
