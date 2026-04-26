const areas = [
  {
    num: "01",
    title: "Advanced Propulsion",
    desc: "Autonomous design of next-generation rocket engines, scramjets, and electric propulsion systems using AI-guided thermodynamic optimization.",
    tags: ["Chemical Propulsion", "Ion Drives", "Nuclear Thermal"],
    accent: "#3B82F6",
  },
  {
    num: "02",
    title: "Aerodynamic Optimization",
    desc: "AI-powered shape optimization for hypersonic vehicles, re-entry capsules, and morphing wing configurations using real-time CFD feedback loops.",
    tags: ["CFD", "Hypersonics", "Morphing Structures"],
    accent: "#8B5CF6",
  },
  {
    num: "03",
    title: "Orbital Mechanics & GNC",
    desc: "Autonomous trajectory planning, station-keeping, and multi-body orbital dynamics simulation for cislunar and deep-space missions.",
    tags: ["GNC", "Trajectory Design", "Deep Space"],
    accent: "#06B6D4",
  },
  {
    num: "04",
    title: "Structural & Materials",
    desc: "Generative topology optimization paired with molecular dynamics simulations to discover ultra-lightweight, high-strength aerospace alloys and composites.",
    tags: ["FEA", "Composites", "Molecular Dynamics"],
    accent: "#10B981",
  },
  {
    num: "05",
    title: "Autonomous Systems & Robotics",
    desc: "End-to-end AI pipelines for autonomous UAV swarms, on-orbit servicing robots, and planetary rover navigation under extreme conditions.",
    tags: ["UAV", "On-Orbit Servicing", "Rover AI"],
    accent: "#F59E0B",
  },
  {
    num: "06",
    title: "Space Weather & Environment",
    desc: "Machine learning models for space weather prediction, radiation environment mapping, and debris avoidance for satellite constellations.",
    tags: ["Space Weather", "Radiation", "Debris Tracking"],
    accent: "#EC4899",
  },
];

export default function ResearchAreas() {
  return (
    <section id="research" className="relative py-28 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div
            className="text-violet-400 text-sm font-semibold tracking-widest uppercase mb-4"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Research Domains
          </div>
          <h2
            style={{ fontFamily: "Orbitron, sans-serif" }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent"
          >
            Six Frontiers of Discovery
          </h2>
          <p
            className="text-gray-400 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Aeroscribe's autonomous agents operate across all major aerospace research domains simultaneously.
          </p>
        </div>

        {/* Areas Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((area) => (
            <div
              key={area.num}
              className="group relative p-7 rounded-3xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 hover:-translate-y-1 cursor-default overflow-hidden"
            >
              {/* Accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${area.accent}, transparent)` }}
              />

              {/* Number */}
              <div
                className="text-5xl font-black mb-4 opacity-10 group-hover:opacity-20 transition-opacity"
                style={{ fontFamily: "Orbitron, sans-serif", color: area.accent }}
              >
                {area.num}
              </div>

              <h3
                className="text-lg font-bold text-white mb-3"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {area.title}
              </h3>
              <p
                className="text-gray-400 text-sm leading-relaxed mb-5"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {area.desc}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {area.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full border font-medium"
                    style={{
                      borderColor: area.accent + "40",
                      color: area.accent,
                      backgroundColor: area.accent + "10",
                      fontFamily: "Space Grotesk, sans-serif",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
