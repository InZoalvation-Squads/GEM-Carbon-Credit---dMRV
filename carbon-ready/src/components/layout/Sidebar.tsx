import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import { prefetchRoute } from '../../routeLoaders';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Upload, Calculator, Gauge,
  ScrollText, ClipboardCheck, Link2, Building2,
  FileText, FilePlus2, ShieldCheck, BookOpen, Cable, Zap, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../store';
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
      {/* Mounted mobile backdrop and rail preserve entry/exit motion. */}
      <div className="rail-overlay fixed inset-x-0 bottom-0 top-16 z-30 bg-ink-950/40 backdrop-blur-sm md:hidden transition-opacity"
        data-open={open} onClick={onClose} aria-hidden />
      <aside ref={ref} id="main-navigation" data-open={open} tabIndex={-1}
        role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined}
        aria-label={mobile && open ? 'Main' : undefined}
        className="mobile-rail fixed top-16 bottom-0 left-0 md:static z-40 w-64 md:h-full flex flex-col print:hidden bg-ink-50 border-r border-ink-200">
        <button type="button" onClick={onClose} aria-label="Close menu" className="sr-only md:hidden"><X size={20} aria-hidden /></button>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <div lang="en" className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
                {group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to} to={to} onClick={onClose}
                    onMouseEnter={() => prefetchRoute(to)} onFocus={() => prefetchRoute(to)}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150',
                        isActive
                          ? 'bg-white text-ink-900 font-semibold shadow-xs ring-1 ring-ink-200/80'
                          : 'text-ink-600 hover:bg-white/70 hover:text-ink-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span aria-hidden
                          className={clsx(
                            'absolute left-0 top-1/2 h-5 -translate-y-1/2 w-1 rounded-r-full bg-brand-500 transition-all duration-200',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <Icon
                          aria-hidden size={18}
                          className={clsx(
                            'transition-colors',
                            isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
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
          <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 shadow-xs">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-600/10">
              <Building2 aria-hidden size={16} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink-900">{org.name}</div>
              <div className="truncate text-[11px] text-ink-500">{org.country}</div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 px-1 text-[11px] text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 motion-safe:animate-pulse" />
            v0.3.0 · Sprint 3 · Guardian
          </div>
        </div>
      </aside>
    </>
  );
}
