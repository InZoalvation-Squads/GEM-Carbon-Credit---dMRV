import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Upload, Calculator, Gauge, ScrollText, Leaf, ClipboardCheck } from 'lucide-react';
import clsx from 'clsx';

const links = [
  { to: '/dashboard',          label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/projects',           label: 'Projects',          icon: FolderKanban },
  { to: '/upload',             label: 'Upload',            icon: Upload },
  { to: '/calculations',       label: 'Calculations',      icon: Calculator },
  { to: '/emission-factors',   label: 'Emission Factors',  icon: Gauge },
  { to: '/verifications',      label: 'Verifications',     icon: ClipboardCheck },
  { to: '/audit-log',          label: 'Audit Log',         icon: ScrollText },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div
        className={clsx('fixed inset-0 z-30 bg-ink-900/40 md:hidden', open ? 'block' : 'hidden')}
        onClick={onClose}
      />
      <aside className={clsx(
        'fixed md:static z-40 w-60 h-full bg-ink-900 text-ink-100 flex-col',
        'transition-transform md:translate-x-0', open ? 'translate-x-0 flex' : '-translate-x-full hidden md:flex'
      )}>
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded bg-brand-500 flex items-center justify-center"><Leaf size={18} className="text-white" /></div>
          <div className="font-semibold tracking-tight">Carbon Ready</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to} onClick={onClose}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-ink-400">
          v0.2.0 • Sprint 2 · Evidence & Verification
        </div>
      </aside>
    </>
  );
}
