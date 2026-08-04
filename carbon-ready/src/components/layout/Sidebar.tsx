import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Upload, Calculator, Gauge,
  ScrollText, ClipboardCheck, Link2, Building2,
  FileText, FilePlus2, ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';

type Item = { to: string; label: string; icon: typeof LayoutDashboard };
type Group = { heading: string; items: Item[] };

const groups: Group[] = [
  {
    heading: 'Registration',
    items: [
      { to: '/methodologies', label: 'Methodologies',   icon: FileText },
      { to: '/registration',  label: 'Register Project', icon: FilePlus2 },
      { to: '/validation',    label: 'Validation Queue', icon: ShieldCheck },
    ],
  },
  {
    heading: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    heading: 'Measure & Report',
    items: [
      { to: '/projects',         label: 'Projects',         icon: FolderKanban },
      { to: '/upload',           label: 'Upload',           icon: Upload },
      { to: '/calculations',     label: 'Calculations',     icon: Calculator },
      { to: '/emission-factors', label: 'Emission Factors', icon: Gauge },
    ],
  },
  {
    heading: 'Verify & Anchor',
    items: [
      { to: '/verifications', label: 'Verifications', icon: ClipboardCheck },
      { to: '/guardian',      label: 'Guardian',      icon: Link2 },
      { to: '/audit-log',     label: 'Audit Log',     icon: ScrollText },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const org = useStore((s) => s.organization);

  return (
    <>
      {/* mobile backdrop (below the header) */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 top-16 z-30 bg-ink-950/40 backdrop-blur-sm md:hidden transition-opacity',
          open ? 'block' : 'hidden',
        )}
        onClick={onClose}
      />
      <aside
        className={clsx(
          'fixed top-16 bottom-0 left-0 md:static z-40 w-64 md:h-full flex-col',
          'bg-ink-50 border-r border-ink-200',
          'transition-transform md:translate-x-0',
          open ? 'translate-x-0 flex' : '-translate-x-full hidden md:flex',
        )}
      >
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {groups.map((group) => (
            <div key={group.heading}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to} to={to} onClick={onClose}
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
                        <span
                          className={clsx(
                            'absolute left-0 top-1/2 h-5 -translate-y-1/2 w-1 rounded-r-full bg-brand-500 transition-all duration-200',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <Icon
                          size={18}
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
              <Building2 size={16} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink-900">{org.name}</div>
              <div className="truncate text-[11px] text-ink-500">{org.country}</div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 px-1 text-[11px] text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            v0.3.0 · Sprint 3 · Guardian
          </div>
        </div>
      </aside>
    </>
  );
}
