const capabilities = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: "Autonomous AI Agents",
    description:
      "Hundreds of specialized AI agents collaborate in real-time to explore design spaces, generate hypotheses, and validate results without human intervention.",
    color: "from-blue-500 to-cyan-500",
    glow: "group-hover:shadow-blue-500/20",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
    title: "High-Fidelity Simulation",
    description:
      "Run thousands of concurrent CFD, FEA, and orbital mechanics simulations with 99.7% accuracy, powered by physics-informed neural networks.",
    color: "from-violet-500 to-purple-500",
    glow: "group-hover:shadow-violet-500/20",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
    title: "Generative Design Engine",
    description:
      "AI-generated structural and aerodynamic configurations that push past human intuition, discovering optimal solutions across millions of design variables simultaneously.",
    color: "from-cyan-500 to-teal-500",
    glow: "group-hover:shadow-cyan-500/20",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    title: "Auto Paper Generation",
    description:
      "Aeroscribe automatically synthesizes research findings into publication-ready scientific papers, citations, and technical reports — complete with figures and analysis.",
    color: "from-orange-500 to-amber-500",
    glow: "group-hover:shadow-orange-500/20",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    title: "Knowledge Graph Engine",
    description:
      "A living, continuously updated knowledge graph that ingests global aerospace literature and experimental data, forming the intellectual backbone of every research cycle.",
    color: "from-emerald-500 to-green-500",
    glow: "group-hover:shadow-emerald-500/20",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: "Certified Validation Pipeline",
    description:
      "End-to-end automated validation against aerospace standards (FAA, ESA, NASA) with full traceability and audit trails for every design decision.",
    color: "from-rose-500 to-pink-500",
    glow: "group-hover:shadow-rose-500/20",
  },
];

export default function Capabilities() {
  return (
    <section id="capabilities" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div
            className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Core Capabilities
          </div>
          <h2
            style={{ fontFamily: "Orbitron, sans-serif" }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent"
          >
            Built for Breakthrough Research
          </h2>
          <p
            className="text-gray-400 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Aeroscribe integrates six powerful systems into one seamless autonomous research pipeline.
          </p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className={`group relative p-7 rounded-3xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${cap.glow} cursor-default`}
            >
              {/* Icon */}
              <div
                className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${cap.color} text-white mb-5 shadow-lg`}
              >
                {cap.icon}
              </div>

              <h3
                className="text-lg font-bold text-white mb-3"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {cap.title}
              </h3>
              <p
                className="text-gray-400 text-sm leading-relaxed"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {cap.description}
              </p>

              {/* Hover gradient border */}
              <div
                className={`absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br ${cap.color} -z-10 blur-xl`}
                style={{ opacity: 0.05 }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
