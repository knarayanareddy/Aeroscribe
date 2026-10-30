const areas = [
  {
    id: '01',
    title: 'Advanced Propulsion',
    description:
      'Rotating detonation engines, scramjets and electric propulsion — pressure-gain combustion cycles are the first target of the evidence pipeline.',
    tags: ['Chemical Propulsion', 'Ion Drives', 'Nuclear Thermal'],
    accent: '#3B82F6',
  },
  {
    id: '02',
    title: 'Aerodynamic Optimization',
    description:
      'Shape optimisation for hypersonic vehicles, re-entry capsules and morphing wings, driven by CFD sweeps rather than intuition.',
    tags: ['CFD', 'Hypersonics', 'Morphing Structures'],
    accent: '#8B5CF6',
  },
  {
    id: '03',
    title: 'Orbital Mechanics & GNC',
    description:
      'Trajectory optimisation, station-keeping and multi-body dynamics for cislunar and deep-space mission design.',
    tags: ['GNC', 'Trajectory Design', 'Deep Space'],
    accent: '#06B6D4',
  },
  {
    id: '04',
    title: 'Structural & Materials',
    description:
      'Topology optimisation paired with materials screening for high-strength, lightweight aerospace structures.',
    tags: ['FEA', 'Composites', 'Materials Science'],
    accent: '#10B981',
  },
  {
    id: '05',
    title: 'Autonomous Systems',
    description:
      'Control and navigation pipelines for UAV swarms, on-orbit servicing and planetary rovers.',
    tags: ['UAV', 'On-Orbit Servicing', 'Rover Autonomy'],
    accent: '#F59E0B',
  },
  {
    id: '06',
    title: 'Space Environment',
    description:
      'Radiation-environment mapping, space-weather modelling and conjunction analysis for satellite constellations.',
    tags: ['Space Weather', 'Radiation', 'Debris Tracking'],
    accent: '#EC4899',
  },
] as const;

export default function ResearchAreas() {
  return (
    <section id="research" className="relative overflow-hidden py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Research Domains
          </p>
          <h2 className="mb-4 bg-gradient-to-r from-white to-cyan-200 bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
            Six frontiers of discovery
          </h2>
          <p className="mx-auto max-w-2xl font-grotesk text-lg text-gray-400">
            The pipeline is domain-agnostic; these are the aerospace areas its journal profiles and
            evidence tooling are designed around.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li
              key={area.id}
              className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.06]"
            >
              <span
                className="absolute inset-x-0 top-0 h-0.5 opacity-30 transition-opacity group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, ${area.accent}, transparent)` }}
                aria-hidden="true"
              />
              <span className="mb-3 block font-display text-3xl font-bold text-white/10">
                {area.id}
              </span>
              <h3 className="mb-2 font-grotesk text-lg font-semibold text-white">{area.title}</h3>
              <p className="mb-4 font-grotesk text-sm leading-relaxed text-gray-400">
                {area.description}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {area.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border px-2.5 py-1 font-grotesk text-xs"
                    style={{
                      borderColor: `${area.accent}40`,
                      color: area.accent,
                      backgroundColor: `${area.accent}10`,
                    }}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
