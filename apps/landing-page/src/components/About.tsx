export default function About() {
  return (
    <section id="about" className="relative py-28 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <div>
            <div
              className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              About Aeroscribe
            </div>
            <h2
              style={{ fontFamily: "Orbitron, sans-serif" }}
              className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent leading-tight"
            >
              Redefining How Aerospace Research Is Done
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-6" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Aeroscribe is the world's first fully autonomous aerospace research laboratory —
              a platform that replaces years of manual experimentation with AI-driven design,
              simulation, and validation pipelines that operate around the clock.
            </p>
            <p className="text-gray-400 text-lg leading-relaxed mb-8" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              From conceptual ideation to validated prototypes, Aeroscribe compresses the full
              research lifecycle into days, enabling breakthroughs in propulsion, aerodynamics,
              materials science, and orbital mechanics at unprecedented speed.
            </p>
            <div className="flex flex-wrap gap-3">
              {["AI-Powered", "Fully Autonomous", "Aerospace-Grade", "Open Platform"].map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-1.5 rounded-full text-sm font-medium border border-blue-500/30 bg-blue-500/10 text-blue-300"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Image + overlay card */}
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden border border-blue-500/20 shadow-2xl shadow-blue-900/30">
              <img
                src="/images/research-lab.jpg"
                alt="Aeroscribe Research Lab"
                className="w-full h-80 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020817] via-transparent to-transparent" />
            </div>

            {/* Floating stats card */}
            <div className="absolute -bottom-6 -left-6 bg-[#0a1628]/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm text-gray-300 font-medium" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  System Status
                </span>
              </div>
              <div className="space-y-2">
                {[
                  { label: "AI Agents Active", value: "247" },
                  { label: "Simulations Running", value: "1,382" },
                  { label: "Papers Generated", value: "89" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between gap-8">
                    <span className="text-xs text-gray-500" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      {item.label}
                    </span>
                    <span
                      className="text-xs font-bold text-blue-400"
                      style={{ fontFamily: "Orbitron, sans-serif" }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -top-4 -right-4 bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl p-4 shadow-xl">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
