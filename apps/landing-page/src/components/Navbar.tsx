import { useState } from "react";

interface NavbarProps {
  scrollY: number;
}

const navLinks = [
  { label: "About", href: "#about" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Research", href: "#research" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Team", href: "#team" },
  { label: "Publications", href: "#publications" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar({ scrollY }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isScrolled = scrollY > 50;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? "bg-[#020817]/90 backdrop-blur-xl border-b border-blue-500/20 shadow-lg shadow-blue-900/20"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 group-hover:opacity-40 transition-opacity animate-pulse" />
              <svg viewBox="0 0 36 36" fill="none" className="w-9 h-9 relative z-10">
                <path
                  d="M18 4L32 28H4L18 4Z"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path d="M18 4L32 28H4L18 4Z" fill="url(#logoGrad)" fillOpacity="0.15" />
                <circle cx="18" cy="20" r="3" fill="#60A5FA" />
                <line x1="18" y1="20" x2="18" y2="28" stroke="#3B82F6" strokeWidth="1" opacity="0.5" />
                <defs>
                  <linearGradient id="logoGrad" x1="4" y1="4" x2="32" y2="28" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span
              style={{ fontFamily: "Orbitron, sans-serif" }}
              className="text-xl font-bold tracking-widest bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent"
            >
              AEROSCRIBE
            </span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-gray-300 hover:text-blue-400 transition-colors duration-200 rounded-md hover:bg-blue-500/10"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              className="ml-4 px-5 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white transition-all duration-300 shadow-lg shadow-blue-900/40 hover:shadow-blue-700/40"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              Get Access
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-md text-gray-300 hover:text-white hover:bg-blue-500/10 transition-colors"
          >
            <div className="w-6 h-5 flex flex-col justify-between">
              <span
                className={`block h-0.5 bg-current transition-all duration-300 ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
              />
              <span
                className={`block h-0.5 bg-current transition-all duration-300 ${menuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 bg-current transition-all duration-300 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
              />
            </div>
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden transition-all duration-300 overflow-hidden ${
            menuOpen ? "max-h-96 pb-4" : "max-h-0"
          }`}
        >
          <div className="flex flex-col gap-1 pt-2 border-t border-blue-500/20">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-300 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setMenuOpen(false)}
              className="mt-2 mx-4 py-2.5 text-center text-sm font-semibold rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              Get Access
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
