import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Upload, Calculator, Gauge,
  ScrollText, ClipboardCheck, Link2, Building2,
  FileText, FilePlus2, ShieldCheck, BookOpen, Cable, Zap, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../store';
import { prefetchRoute } from '../../routeLoaders';
import type { UserRole } from '../../types';

// `roles` lists which roles see the item. Omit to show it to everyone.
type Item = { to: string; label: string; icon: typeof LayoutDashboard; roles?: UserRole[] };
type Group = { heading: string; items: Item[] };

const groups: Group[] = [
  {
    heading: 'Registration',
    items: [
      { to: '/methodologies', label: 'Methodologies',   icon: FileText },
      { to: '/registration',  label: 'Register Project', icon: FilePlus2, roles: ['project_owner', 'esg_manager'] },
      { to: '/validation',    label: 'Validation Queue', icon: ShieldCheck, roles: ['verifier', 'admin'] },
    ],
  },
  {
    heading: 'Overview',
    items: [
      { to: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { to: '/how-it-works', label: 'How it works', icon: BookOpen },
    ],
  },
  {
    heading: 'Measure & Report',
    items: [
      { to: '/projects',         label: 'Projects',         icon: FolderKanban },
      { to: '/upload',           label: 'Upload',           icon: Upload,      roles: ['project_owner', 'esg_manager'] },
      { to: '/iot',              label: 'IoT Mapping',      icon: Cable,       roles: ['project_owner', 'esg_manager', 'admin'] },
      { to: '/calculations',     label: 'Calculations',     icon: Calculator,  roles: ['project_owner', 'esg_manager'] },
      { to: '/emission-factors', label: 'Emission Factors', icon: Gauge,       roles: ['esg_manager', 'admin'] },
    ],
  },
  {
    heading: 'Verify & Anchor',
    items: [
      { to: '/verifications', label: 'Verifications', icon: ClipboardCheck, roles: ['project_owner', 'verifier'] },
      { to: '/rec-issuance',  label: 'REC Issuance',  icon: Zap,            roles: ['project_owner', 'esg_manager', 'verifier'] },
      { to: '/guardian',      label: 'Guardian',      icon: Link2,          roles: ['verifier', 'admin'] },
      { to: '/audit-log',     label: 'Audit Log',     icon: ScrollText,     roles: ['admin', 'esg_manager'] },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 767px)');
    const update = () => setMobile(media ? media.matches : window.innerWidth < 768);
    update();
    if (media) { media.addEventListener('change', update); return () => media.removeEventListener('change', update); }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useLayoutEffect(() => { if (ref.current) ref.current.inert = mobile && !open; }, [mobile, open]);
  useDialogFocus(ref, mobile && open, onClose);
  const org = useStore((s) => s.organization);
  const role = useStore((s) => s.currentUser.role);

  // Keep only items visible to the current role, then drop groups left empty.
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="rail-overlay fixed inset-x-0 bottom-0 top-16 z-30 bg-petrol-950/40 md:hidden" data-open={open} onClick={onClose} aria-hidden />
      <aside ref={ref} id="main-navigation" data-open={open} tabIndex={-1}
        role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined}
        aria-label={mobile && open ? 'Main' : undefined}
        className="mobile-rail fixed bottom-0 left-0 top-16 z-40 flex w-64 flex-col border-r border-rule bg-rail text-ink md:static md:h-full md:shrink-0 print:hidden">
        <button type="button" onClick={onClose} aria-label="Close menu" className="m-3 grid h-11 w-11 shrink-0 place-items-center self-end rounded-sheet text-ink-meta hover:bg-white/70 md:hidden"><X size={20} aria-hidden /></button>
        <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <div lang="en" className="sidebar-group px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-ink-meta">
                {group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to} to={to} onClick={onClose}
                    onMouseEnter={() => prefetchRoute(to)} onFocus={() => prefetchRoute(to)}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex min-h-11 md:min-h-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out',
                        isActive
                          ? 'bg-white text-ink font-semibold ring-1 ring-rule shadow-xs'
                          : 'text-ink-secondary hover:bg-white/70 hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span aria-hidden
                          className={clsx(
                            'absolute left-0 top-1/2 h-5 -translate-y-1/2 w-[3px] rounded-r-full bg-petrol-700 transition-opacity duration-150 ease-out',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <Icon
                          aria-hidden size={18}
                          className={clsx(
                            'transition-colors duration-150 ease-out',
                            isActive ? 'text-petrol-700' : 'text-ink-meta group-hover:text-ink-secondary',
                          )}
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Org card */}
        <div className="px-3 pb-4 pt-2">
          <div className="flex items-center gap-3 rounded-xl border border-rule bg-white px-3 py-2.5 shadow-xs">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-petrol-50 text-petrol-700">
              <Building2 size={16} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{org.name}</div>
              <div className="truncate text-xs text-ink-meta">{org.country}</div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 px-1 text-xs text-ink-meta">
            v0.3.0 · Sprint 3 · Guardian
          </div>
        </div>
      </aside>
    </>
  );
}
