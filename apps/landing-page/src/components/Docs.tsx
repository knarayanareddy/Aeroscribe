import { site } from '../config/site';

const documents = [
  {
    title: 'Implementation status',
    path: 'docs/IMPLEMENTATION_STATUS.md',
    description:
      'What is implemented, what is specified and what is merely aspirational — the first file to read before trusting anything else in the repo.',
    accent: '#3B82F6',
  },
  {
    title: 'System architecture',
    path: 'specs/architecture.md',
    description:
      'The system as built: two Vite apps, a shared pipeline package, the state model, CI and the Pages deployment.',
    accent: '#8B5CF6',
  },
  {
    title: 'Pipeline & gates',
    path: 'specs/pipeline.md',
    description:
      'The nine stages, their agents, the human gate protocol and the run state machine with its transitions.',
    accent: '#06B6D4',
  },
  {
    title: 'Integrity rules',
    path: 'specs/integrity-rules.md',
    description:
      'RULE-001 to RULE-063: zero fabrication, citation verification, AI authorship, secret handling and append-only evidence — with the enforcement status of each rule group.',
    accent: '#10B981',
  },
] as const;

export default function Docs() {
  return (
    <section id="docs" className="relative overflow-hidden py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-orange-400">
            Documentation
          </p>
          <h2 className="mb-4 bg-gradient-to-r from-white to-orange-200 bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
            Read the specification
          </h2>
          <p className="mx-auto max-w-2xl font-grotesk text-lg text-gray-400">
            AeroScribe has not produced peer-reviewed publications yet. What it does have is a
            written specification, published openly, so every claim in this page can be checked
            against it.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-center">
          <p className="font-grotesk text-sm text-amber-200">
            <strong className="font-semibold">No publications to date.</strong> Every result shown
            in the dashboard is illustrative fixture data, labelled as such.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-2">
          {documents.map((document) => (
            <li
              key={document.path}
              className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.06]"
            >
              <span
                className="absolute inset-x-0 top-0 h-0.5 opacity-30 transition-opacity group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, ${document.accent}, transparent)` }}
                aria-hidden="true"
              />
              <h3 className="mb-1 font-grotesk text-lg font-semibold text-white">
                {document.title}
              </h3>
              <p className="mb-3 font-mono text-xs text-gray-500">{document.path}</p>
              <p className="mb-5 font-grotesk text-sm leading-relaxed text-gray-400">
                {document.description}
              </p>
              <a
                href={`${site.repoUrl}/blob/main/${document.path}`}
                className="inline-flex items-center gap-2 font-grotesk text-sm font-medium transition-colors"
                style={{ color: document.accent }}
              >
                Open document
                <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
