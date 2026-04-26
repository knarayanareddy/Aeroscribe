const steps = [
  {
    step: "01",
    title: "Define Research Objective",
    desc: "Researchers specify a high-level aerospace challenge. Aeroscribe's orchestrator AI breaks it into sub-problems and assigns specialized agent teams.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
    color: "from-blue-500 to-blue-600",
  },
  {
    step: "02",
    title: "Knowledge Acquisition",
    desc: "The platform automatically ingests and synthesizes thousands of relevant papers, datasets, and experimental records from global aerospace repositories.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    color: "from-violet-500 to-violet-600",
  },
  {
    step: "03",
    title: "Autonomous Hypothesis Generation",
    desc: "AI agents formulate novel hypotheses, design configurations, and experimental setups using a combination of LLMs, physics models, and evolutionary algorithms.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    color: "from-cyan-500 to-cyan-600",
  },
  {
    step: "04",
    title: "Simulation & Validation",
    desc: "Thousands of parallel high-fidelity simulations (CFD, FEA, orbital mechanics) validate each hypothesis automatically, with results fed back into the optimization loop.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
    color: "from-emerald-500 to-emerald-600",
  },
  {
    step: "05",
    title: "Research Output",
    desc: "Validated findings are automatically compiled into comprehensive research reports, technical papers, design specs, and patent applications — ready for review.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    color: "from-orange-500 to-orange-600",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div
            className="text-cyan-400 text-sm font-semibold tracking-widest uppercase mb-4"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            The Process
          </div>
          <h2
            style={{ fontFamily: "Orbitron, sans-serif" }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent"
          >
            How Aeroscribe Works
          </h2>
          <p
            className="text-gray-400 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            A fully closed-loop research pipeline — from problem statement to published results — with zero manual steps.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line */}
          <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-blue-500/50 via-violet-500/50 to-transparent hidden lg:block" style={{ left: "calc(50% - 0.5px)" }} />

          <div className="space-y-8">
            {steps.map((step, i) => (
              <div
                key={step.step}
                className={`flex flex-col lg:flex-row items-center gap-8 ${i % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
              >
                {/* Card */}
                <div className="flex-1 p-7 rounded-3xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 group">
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 p-3 rounded-2xl bg-gradient-to-br ${step.color} text-white`}>
                      {step.icon}
                    </div>
                    <div>
                      <div
                        className="text-xs font-bold text-gray-500 mb-1"
                        style={{ fontFamily: "Orbitron, sans-serif" }}
                      >
                        STEP {step.step}
                      </div>
                      <h3
                        className="text-lg font-bold text-white mb-2"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {step.title}
                      </h3>
                      <p
                        className="text-gray-400 text-sm leading-relaxed"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Center dot (desktop) */}
                <div className="hidden lg:flex shrink-0 w-10 h-10 items-center justify-center">
                  <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${step.color} shadow-lg ring-4 ring-[#020817]`} />
                </div>

                {/* Spacer */}
                <div className="flex-1 hidden lg:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
