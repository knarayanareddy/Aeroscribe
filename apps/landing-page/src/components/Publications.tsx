const publications = [
  {
    title: "Autonomous Multi-Agent Design of Next-Generation Hypersonic Vehicle Aeroshells",
    journal: "Journal of Aerospace Engineering",
    year: "2024",
    abstract:
      "We present Aeroscribe's first fully autonomous design cycle producing a Mach 12 re-entry vehicle aeroshell with 23% lower peak heating than baseline configurations.",
    tags: ["Hypersonics", "CFD", "AI Design"],
    doi: "10.1234/jae.2024.001",
    accent: "#3B82F6",
  },
  {
    title: "Physics-Informed Neural Networks for Real-Time Rocket Engine Combustion Stability Prediction",
    journal: "Combustion and Flame",
    year: "2024",
    abstract:
      "A novel PINN architecture trained on 50,000 CFD simulations achieves 99.3% accuracy in predicting combustion instability onset in LOX/LH2 engines.",
    tags: ["Propulsion", "PINN", "Combustion"],
    doi: "10.1234/cf.2024.042",
    accent: "#8B5CF6",
  },
  {
    title: "Closed-Loop Autonomous Trajectory Optimization for Cislunar Station-Keeping",
    journal: "Acta Astronautica",
    year: "2023",
    abstract:
      "Aeroscribe's orbital mechanics agents reduce station-keeping delta-V requirements by 31% compared to state-of-the-art numerical methods for NRHO orbits.",
    tags: ["GNC", "Cislunar", "Trajectory"],
    doi: "10.1234/aa.2023.118",
    accent: "#06B6D4",
  },
  {
    title: "Generative Topology Optimization for Lightweight Aerospace Structural Components",
    journal: "Composite Structures",
    year: "2023",
    abstract:
      "AI-generated structural topologies achieve 40% mass reduction while maintaining structural margins, validated through physical testing at aerospace-grade load conditions.",
    tags: ["Structures", "Generative AI", "FEA"],
    doi: "10.1234/cs.2023.209",
    accent: "#10B981",
  },
];

export default function Publications() {
  return (
    <section id="publications" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div
            className="text-orange-400 text-sm font-semibold tracking-widest uppercase mb-4"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Research Output
          </div>
          <h2
            style={{ fontFamily: "Orbitron, sans-serif" }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-orange-200 bg-clip-text text-transparent"
          >
            Latest Publications
          </h2>
          <p
            className="text-gray-400 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Peer-reviewed research autonomously generated, validated, and published by Aeroscribe.
          </p>
        </div>

        {/* Publications */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {publications.map((pub) => (
            <div
              key={pub.doi}
              className="group p-7 rounded-3xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
            >
              {/* Top accent */}
              <div
                className="absolute top-0 left-0 w-full h-0.5 opacity-30 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, ${pub.accent}, transparent)` }}
              />

              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-wrap gap-2">
                  {pub.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-1 rounded-full border font-medium"
                      style={{
                        borderColor: pub.accent + "40",
                        color: pub.accent,
                        backgroundColor: pub.accent + "10",
                        fontFamily: "Space Grotesk, sans-serif",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span
                  className="text-xs text-gray-500 shrink-0 ml-2"
                  style={{ fontFamily: "Orbitron, sans-serif" }}
                >
                  {pub.year}
                </span>
              </div>

              <h3
                className="text-base font-bold text-white mb-3 leading-snug"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {pub.title}
              </h3>

              <p
                className="text-xs text-gray-500 italic mb-3"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {pub.journal}
              </p>

              <p
                className="text-gray-400 text-sm leading-relaxed mb-5"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {pub.abstract}
              </p>

              <a
                href={`https://doi.org/${pub.doi}`}
                className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: pub.accent, fontFamily: "Space Grotesk, sans-serif" }}
              >
                Read Paper →
              </a>
            </div>
          ))}
        </div>

        {/* View all */}
        <div className="text-center">
          <a
            href="#"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:text-white hover:border-blue-400 hover:bg-blue-500/20 font-semibold text-sm transition-all duration-300"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            View All Publications →
          </a>
        </div>
      </div>
    </section>
  );
}
