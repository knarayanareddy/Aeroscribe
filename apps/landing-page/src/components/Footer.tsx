const links = {
  Platform: ["Capabilities", "Research Areas", "How It Works", "API Docs", "Status"],
  Company: ["About", "Team", "Careers", "Press Kit", "Blog"],
  Research: ["Publications", "Datasets", "Benchmarks", "Open Source", "Community"],
  Legal: ["Privacy Policy", "Terms of Service", "Security", "Compliance"],
};

export default function Footer() {
  return (
    <footer className="relative border-t border-white/5 pt-20 pb-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_30%_at_50%_0%,rgba(59,130,246,0.05),transparent)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-10 mb-16">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-9 h-9">
                <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20" />
                <svg viewBox="0 0 36 36" fill="none" className="w-9 h-9 relative z-10">
                  <path d="M18 4L32 28H4L18 4Z" stroke="#3B82F6" strokeWidth="1.5" fill="none" />
                  <path d="M18 4L32 28H4L18 4Z" fill="url(#footerLogoGrad)" fillOpacity="0.15" />
                  <circle cx="18" cy="20" r="3" fill="#60A5FA" />
                  <line x1="18" y1="20" x2="18" y2="28" stroke="#3B82F6" strokeWidth="1" opacity="0.5" />
                  <defs>
                    <linearGradient id="footerLogoGrad" x1="4" y1="4" x2="32" y2="28" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#3B82F6" />
                      <stop offset="1" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span
                style={{ fontFamily: "Orbitron, sans-serif" }}
                className="text-lg font-bold tracking-widest bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent"
              >
                AEROSCRIBE
              </span>
            </div>
            <p
              className="text-gray-500 text-sm leading-relaxed mb-6 max-w-xs"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              The world's first autonomous aerospace research laboratory — compressing decades of discovery into days.
            </p>
            {/* Social */}
            <div className="flex gap-3">
              {[
                { label: "GitHub", icon: "⌥" },
                { label: "Twitter", icon: "𝕏" },
                { label: "LinkedIn", icon: "in" },
                { label: "Discord", icon: "◈" },
              ].map((s) => (
                <button
                  key={s.label}
                  aria-label={s.label}
                  className="w-9 h-9 rounded-lg bg-white/5 hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 text-xs font-bold transition-all flex items-center justify-center border border-white/5 hover:border-blue-500/30"
                >
                  {s.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <div
                className="text-white text-sm font-semibold mb-4"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {category}
              </div>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Newsletter */}
        <div className="border-t border-white/5 pt-10 mb-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div
                className="text-white font-semibold mb-1"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                Stay on the frontier
              </div>
              <div
                className="text-gray-500 text-sm"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                Get the latest research breakthroughs, platform updates, and aerospace AI news.
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 md:w-64 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              />
              <button
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white text-sm font-semibold hover:from-blue-500 hover:to-violet-500 transition-all whitespace-nowrap"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-gray-600 text-xs">
          <div style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            © {new Date().getFullYear()} Aeroscribe. All rights reserved. World's first autonomous aerospace research laboratory.
          </div>
          <div
            className="flex items-center gap-1"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            &nbsp;All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
