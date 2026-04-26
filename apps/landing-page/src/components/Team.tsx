const team = [
  {
    name: "Dr. Kavya Narayana Reddy",
    role: "Founder & Chief Scientist",
    bio: "Aerospace engineer with 15+ years in computational aerodynamics and AI systems. Pioneered autonomous research methods at leading space agencies.",
    initials: "KNR",
    color: "from-blue-500 to-cyan-500",
  },
  {
    name: "Dr. Arjun Mehta",
    role: "Head of AI Research",
    bio: "Former DeepMind researcher specializing in multi-agent systems and physics-informed neural networks applied to aerospace simulation.",
    initials: "AM",
    color: "from-violet-500 to-purple-500",
  },
  {
    name: "Dr. Lena Vogel",
    role: "Director of Propulsion Science",
    bio: "Chemical propulsion expert with experience at ESA and DLR. Leads the autonomous design of next-generation rocket engine configurations.",
    initials: "LV",
    color: "from-cyan-500 to-teal-500",
  },
  {
    name: "Dr. Marcus Obi",
    role: "Orbital Mechanics Lead",
    bio: "NASA JPL veteran specializing in trajectory optimization and multi-body dynamics for deep space and cislunar missions.",
    initials: "MO",
    color: "from-emerald-500 to-green-500",
  },
  {
    name: "Dr. Priya Rajan",
    role: "Materials Intelligence Lead",
    bio: "Computational materials scientist developing AI pipelines for discovering high-performance aerospace alloys and composite structures.",
    initials: "PR",
    color: "from-orange-500 to-amber-500",
  },
  {
    name: "Dr. Yuki Tanaka",
    role: "Autonomous Systems Architect",
    bio: "Robotics and control systems expert building the multi-agent orchestration layer that coordinates Aeroscribe's research pipelines.",
    initials: "YT",
    color: "from-rose-500 to-pink-500",
  },
];

export default function Team() {
  return (
    <section id="team" className="relative py-28 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div
            className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-4"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            The Team
          </div>
          <h2
            style={{ fontFamily: "Orbitron, sans-serif" }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent"
          >
            Minds Behind the Mission
          </h2>
          <p
            className="text-gray-400 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            World-class aerospace scientists, AI researchers, and engineers united by a singular vision.
          </p>
        </div>

        {/* Team Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {team.map((member) => (
            <div
              key={member.name}
              className="group p-7 rounded-3xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1"
            >
              {/* Avatar */}
              <div className="flex items-center gap-4 mb-5">
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${member.color} flex items-center justify-center text-white font-bold text-lg shadow-lg`}
                  style={{ fontFamily: "Orbitron, sans-serif" }}
                >
                  {member.initials}
                </div>
                <div>
                  <div
                    className="font-bold text-white text-base"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {member.name}
                  </div>
                  <div
                    className="text-xs text-blue-400 font-medium mt-0.5"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    {member.role}
                  </div>
                </div>
              </div>
              <p
                className="text-gray-400 text-sm leading-relaxed"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {member.bio}
              </p>

              {/* Social links placeholder */}
              <div className="flex gap-3 mt-5">
                {["in", "◎", "✉"].map((icon, i) => (
                  <button
                    key={i}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-blue-400 text-xs font-bold transition-colors flex items-center justify-center"
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
