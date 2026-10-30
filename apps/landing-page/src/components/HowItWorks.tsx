import { GATE_CHECKPOINT_COUNT, PIPELINE_STAGES, STAGE_COUNT } from '@aeroscribe/pipeline';

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/20 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-blue-400">
            The Process
          </p>
          <h2 className="mb-4 bg-gradient-to-r from-white to-blue-200 bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
            {STAGE_COUNT} stages, {GATE_CHECKPOINT_COUNT} human checkpoints
          </h2>
          <p className="mx-auto max-w-2xl font-grotesk text-lg text-gray-400">
            No stage can silently hand off to the next one: every stage ends at a gate that a
            researcher must approve or send back for revision. Stage 4 has three separate
            checkpoints in the specification ({GATE_CHECKPOINT_COUNT} in total, not {STAGE_COUNT});
            the prototype dashboard models one gate field per stage. This list is generated from the
            same stage definitions the dashboard uses.
          </p>
        </div>

        <ol className="grid gap-4 md:grid-cols-3">
          {PIPELINE_STAGES.map((stage, index) => (
            <li
              key={stage.id}
              className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 transition-colors hover:border-blue-500/30 hover:bg-white/[0.06]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-xs text-gray-500">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                  {stage.gateId}
                </span>
              </div>
              <h3 className="mb-1 font-grotesk text-base font-semibold text-white">{stage.name}</h3>
              <p className="font-mono text-xs leading-relaxed text-gray-500">
                {stage.agents.join(' · ')}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-center font-grotesk text-sm text-gray-500">
          Gate identifiers and agent assignments are defined once in{' '}
          <span className="font-mono text-gray-400">packages/pipeline/src/stages.ts</span> and
          consumed by the dashboard, this page and the tests.
        </p>
      </div>
    </section>
  );
}
