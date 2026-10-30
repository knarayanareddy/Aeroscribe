import { cn } from '@aeroscribe/ui';
import { useEffect, useState } from 'react';
import { navLinks, site } from '../config/site';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-blue-500/20 bg-ink/90 shadow-lg shadow-blue-900/20 backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between md:h-20">
          <a href="#top" className="group flex items-center gap-3">
            <span className="relative h-9 w-9" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-blue-500 opacity-20 transition-opacity group-hover:opacity-40 motion-safe:animate-pulse" />
              <svg viewBox="0 0 36 36" fill="none" className="relative z-10 h-9 w-9">
                <path d="M18 4L32 28H4L18 4Z" stroke="#3B82F6" strokeWidth={1.5} fill="none" />
                <path d="M18 4L32 28H4L18 4Z" fill="url(#logoGrad)" fillOpacity={0.15} />
                <circle cx="18" cy="20" r={3} fill="#60A5FA" />
                <line
                  x1="18"
                  y1="20"
                  x2="18"
                  y2="28"
                  stroke="#3B82F6"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <defs>
                  <linearGradient
                    id="logoGrad"
                    x1="4"
                    y1="4"
                    x2="32"
                    y2="28"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text font-display text-xl font-bold tracking-widest text-transparent">
              AEROSCRIBE
            </span>
          </a>

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 font-grotesk text-sm font-medium text-gray-300 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
              >
                {link.label}
              </a>
            ))}
            <a
              href={site.dashboardUrl}
              className="ml-2 rounded-full border border-blue-500/40 px-4 py-2 font-grotesk text-sm font-semibold text-blue-200 transition-colors hover:border-blue-400 hover:bg-blue-500/10 hover:text-white"
            >
              Open dashboard
            </a>
            <a
              href="#contact"
              className="ml-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2 font-grotesk text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:from-blue-500 hover:to-violet-500"
            >
              Get updates
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="rounded-md p-2 text-gray-300 transition-colors hover:bg-blue-500/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 lg:hidden"
          >
            <span className="flex h-5 w-6 flex-col justify-between" aria-hidden="true">
              <span
                className={cn(
                  'block h-0.5 bg-current transition-all duration-300',
                  menuOpen && 'translate-y-2 rotate-45',
                )}
              />
              <span
                className={cn(
                  'block h-0.5 bg-current transition-all duration-300',
                  menuOpen && 'opacity-0',
                )}
              />
              <span
                className={cn(
                  'block h-0.5 bg-current transition-all duration-300',
                  menuOpen && '-translate-y-2 -rotate-45',
                )}
              />
            </span>
          </button>
        </div>

        <div
          id="mobile-nav"
          hidden={!menuOpen}
          className={cn('overflow-hidden lg:hidden', menuOpen ? 'pb-4' : '')}
        >
          <div className="flex flex-col gap-1 border-t border-blue-500/20 pt-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-4 py-2.5 font-grotesk text-sm font-medium text-gray-300 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
              >
                {link.label}
              </a>
            ))}
            <a
              href={site.dashboardUrl}
              onClick={() => setMenuOpen(false)}
              className="mx-4 mt-2 rounded-full border border-blue-500/40 py-2.5 text-center font-grotesk text-sm font-semibold text-blue-200"
            >
              Open dashboard
            </a>
            <a
              href="#contact"
              onClick={() => setMenuOpen(false)}
              className="mx-4 mt-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 py-2.5 text-center font-grotesk text-sm font-semibold text-white"
            >
              Get updates
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
