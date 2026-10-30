import { cn } from '@aeroscribe/ui';
import { useEffect, type ReactNode } from 'react';
import { mockReviewComments } from '../data/mockData';
import { usePipeline } from '../state/pipelineContext';

export type View =
  | 'dashboard'
  | 'pipeline'
  | 'literature'
  | 'novelty'
  | 'cfd'
  | 'manuscript'
  | 'review'
  | 'wiki'
  | 'settings';

interface NavItem {
  id: View;
  label: string;
  icon: ReactNode;
  badge?: number;
  badgeLabel?: string;
}

const iconProps = {
  className: 'h-5 w-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  viewBox: '0 0 24 24',
} as const;

const NavIcon = ({ children }: { children: ReactNode }) => (
  <svg {...iconProps} aria-hidden="true">
    {children}
  </svg>
);

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeView, onNavigate, open, onClose }: SidebarProps) {
  const { state } = usePipeline();
  const gatesPending = state.runs.filter((run) => run.status === 'gate_pending').length;
  const openReviewComments = mockReviewComments.filter((comment) => !comment.resolved).length;

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <NavIcon>
          <rect x={3} y={3} width={7} height={7} rx={1.5} />
          <rect x={14} y={3} width={7} height={7} rx={1.5} />
          <rect x={14} y={14} width={7} height={7} rx={1.5} />
          <rect x={3} y={14} width={7} height={7} rx={1.5} />
        </NavIcon>
      ),
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: (
        <NavIcon>
          <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
        </NavIcon>
      ),
      badge: gatesPending,
      badgeLabel: `${gatesPending} runs awaiting a gate decision`,
    },
    {
      id: 'literature',
      label: 'Literature',
      icon: (
        <NavIcon>
          <path
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavIcon>
      ),
    },
    {
      id: 'novelty',
      label: 'Novelty',
      icon: (
        <NavIcon>
          <path
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavIcon>
      ),
    },
    {
      id: 'cfd',
      label: 'Evidence / CFD',
      icon: (
        <NavIcon>
          <path
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavIcon>
      ),
    },
    {
      id: 'manuscript',
      label: 'Manuscript',
      icon: (
        <NavIcon>
          <path
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavIcon>
      ),
    },
    {
      id: 'review',
      label: 'Peer Review',
      icon: (
        <NavIcon>
          <path
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavIcon>
      ),
      badge: openReviewComments,
      badgeLabel: `${openReviewComments} unresolved review comments in the fixture set`,
    },
    {
      id: 'wiki',
      label: 'AeroWiki',
      icon: (
        <NavIcon>
          <path
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </NavIcon>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <NavIcon>
          <path
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={12} cy={12} r={3} />
        </NavIcon>
      ),
    },
  ];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-900/40">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-white">AeroScribe</p>
            <p className="text-xs text-slate-400">Research Engine v0.2</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav aria-label="Dashboard sections" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
              )}
            >
              <span
                className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}
              >
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge ? (
                <span
                  title={item.badgeLabel}
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                    isActive ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white',
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
            KNR
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">K. Narayana Reddy</p>
            <p className="text-xs text-slate-500">Maintainer</p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
            Demo
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Illustrative fixture data. No pipeline backend is connected.
        </p>
      </div>
    </>
  );

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {content}
      </aside>
    </>
  );
}
