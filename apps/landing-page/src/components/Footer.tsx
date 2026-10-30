import { site } from '../config/site';

const linkGroups = [
  {
    heading: 'Project',
    links: [
      { label: 'GitHub repository', href: site.repoUrl },
      { label: 'Issues', href: site.issuesUrl },
      { label: 'Contributing', href: `${site.repoUrl}/blob/main/CONTRIBUTING.md` },
      { label: 'License (MIT)', href: `${site.repoUrl}/blob/main/LICENSE` },
    ],
  },
  {
    heading: 'Documentation',
    links: [
      {
        label: 'Implementation status',
        href: `${site.repoUrl}/blob/main/docs/IMPLEMENTATION_STATUS.md`,
      },
      { label: 'System architecture', href: `${site.repoUrl}/blob/main/specs/architecture.md` },
      { label: 'Pipeline & gates', href: `${site.repoUrl}/blob/main/specs/pipeline.md` },
      { label: 'Integrity rules', href: `${site.repoUrl}/blob/main/specs/integrity-rules.md` },
    ],
  },
  {
    heading: 'Applications',
    links: [
      { label: 'Landing page', href: '#top' },
      { label: 'Researcher dashboard', href: site.dashboardUrl },
      { label: 'Security policy', href: `${site.repoUrl}/blob/main/SECURITY.md` },
    ],
  },
] as const;

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/5 bg-ink">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500">
                <svg viewBox="0 0 36 36" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M18 6L30 28H6L18 6Z" stroke="#fff" strokeWidth={2} />
                </svg>
              </span>
              <span className="font-display text-lg font-bold tracking-widest text-white">
                AEROSCRIBE
              </span>
            </div>
            <p className="mb-4 max-w-sm font-grotesk text-sm leading-relaxed text-gray-500">
              An open prototype of an auditable autonomous aerospace research pipeline. Illustrative
              data only — no peer-reviewed output yet.
            </p>
            <a
              href={site.repoUrl}
              className="inline-flex items-center gap-2 font-grotesk text-sm font-medium text-gray-400 transition-colors hover:text-white"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .5A11.5 11.5 0 0 0 .5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.7 1.27 3.36.97.1-.75.4-1.27.73-1.56-2.56-.29-5.25-1.29-5.25-5.75 0-1.27.45-2.31 1.19-3.12-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.19a10.9 10.9 0 0 1 5.79 0c2.2-1.5 3.17-1.19 3.17-1.19.63 1.59.23 2.77.12 3.06.74.81 1.18 1.85 1.18 3.12 0 4.47-2.69 5.45-5.26 5.74.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55A11.51 11.51 0 0 0 23.5 12.02C23.5 5.66 18.35.5 12 .5Z" />
              </svg>
              Star or fork on GitHub
            </a>
          </div>

          {linkGroups.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="mb-4 font-grotesk text-sm font-semibold text-white">
                {group.heading}
              </h2>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="font-grotesk text-sm text-gray-500 transition-colors hover:text-gray-300"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 font-grotesk text-xs text-gray-600 md:flex-row">
          <p>© {year} AeroScribe contributors · MIT licensed · not affiliated with any agency</p>
          <p className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Static prototype — no tracking, no cookies
          </p>
        </div>
      </div>
    </footer>
  );
}
