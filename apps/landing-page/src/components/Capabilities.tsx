type CapabilityStatus = 'prototype' | 'specified';

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
      'Specialised agents own one pipeline stage each, with an orchestrator that tracks state, retries and cost per run. The stage graph and hand-off protocol are specified; the runtime is next.',
    status: 'specified',
    icon: '🧠',
  },
  {
    title: 'Literature archaeology',
    description:
      'Semantic Scholar, arXiv, Crossref and NTRS queries with DOI resolution, citation-graph expansion and relevance reranking. Every reference must resolve before it may be cited.',
    status: 'specified',
    icon: '📚',
  },
  {
    title: 'Uncertainty-first evidence',
    description:
      'Each computed value is stored with its uncertainty, confidence level, method and a SHA-256 checksum. The dashboard already renders results in value ± uncertainty (method, CI) form.',
    status: 'prototype',
    icon: '🔐',
  },
  {
    title: 'Novelty and gap detection',
    description:
      'A gap matrix over phenomena × methodology × scale, scored against recent preprints to estimate pre-emption risk before any compute is spent.',
    status: 'specified',
    icon: '🔍',
  },
  {
    title: 'Peer-review council',
    description:
      'Methodology, literature, physics and compliance reviewers raise severity-tagged comments; the dashboard tracks resolution rate and blocks submission on open majors.',
    status: 'prototype',
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
  prototype: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  specified: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
};

const statusLabels: Record<CapabilityStatus, string> = {
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
            Each card is labelled with what actually exists today: pieces running in the dashboard
            versus pieces specified for the backend.
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
