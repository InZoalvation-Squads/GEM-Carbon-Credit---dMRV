import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { Menu, Check, ChevronDown, ShieldCheck, FolderKanban, Gauge, Settings, LogOut } from 'lucide-react';
import type { UserRole } from '../../types';
import { ROLE_LABEL } from '../../lib/labels';
import { serverMode } from '../../lib/server-api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../data/accounts';
import { toast } from './Toast';
import clsx from 'clsx';

// Labels come from ROLE_LABEL (Guardian VM0047 terminology) so the switcher stays
// in sync with the rest of the app; only desc/icon are local to the switcher.
const ROLES: { value: UserRole; label: string; desc: string; icon: typeof ShieldCheck }[] = [
  { value: 'project_owner', label: ROLE_LABEL.project_owner, desc: 'Create projects, submit PDD, data & evidence', icon: FolderKanban },
  { value: 'esg_manager',   label: ROLE_LABEL.esg_manager,   desc: 'Emission factors & carbon calculation',        icon: Gauge },
  { value: 'verifier',      label: ROLE_LABEL.verifier,      desc: 'Validate & verify, approve & anchor packages', icon: ShieldCheck },
  { value: 'admin',         label: ROLE_LABEL.admin,         desc: 'Registry: pipeline, issuance & minting',       icon: Settings },
];

export function TopBar({ onOpenSidebar, sidebarOpen = false }: { onOpenSidebar: () => void; sidebarOpen?: boolean }) {
  const user = useStore((s) => s.currentUser);
  const setRole = useStore((s) => s.setRole);
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]')?.focus();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const trigger = ref.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
      const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []);
      if (e.key === 'Escape') { setOpen(false); trigger?.focus(); }
      if (e.key === 'Tab') setOpen(false);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && items.length) {
        e.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 :
          e.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1);
        items[next].focus();
      }
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = ROLES.find((r) => r.value === user.role);

  async function pick(role: UserRole) {
    setOpen(false);
    if (role === user.role) return;
    const label = ROLES.find((r) => r.value === role)?.label;
    // Server mode: the API authorizes from the JWT, so flipping client state
    // alone leaves the old role's token behind (every action would 403).
    // Re-authenticate as the demo account that really holds the target role.
    if (serverMode()) {
      const demo = DEMO_ACCOUNTS.find((a) => a.role === role);
      if (!demo) return;
      const res = await login(demo.email, DEMO_PASSWORD);
      if (res.ok) toast.info('Role switched', `Signed in as ${demo.name} — ${label}.`);
      else toast.error('Role switch failed', res.error ?? 'Could not sign in to the demo account.');
      return;
    }
    setRole(role);
    toast.info('Role switched', `You are now acting as ${label}.`);
  }

  return (
    <header className="relative z-30 h-16 shrink-0 bg-header-gradient text-white border-b border-black/20 px-3 md:px-6 flex items-center justify-between print:hidden">
      {/* Left: menu + brand */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10"
          aria-label="Toggle menu"
          aria-expanded={sidebarOpen}
          aria-controls="main-navigation"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-3">
          <img
            src="/gem-logo.svg" width={1003} height={210} loading="eager" decoding="async"
            alt="GEM Carbon Credit"
            className="h-7 md:h-8 w-auto select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Right: actions + user */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* User / role switcher */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-1.5 sm:pr-2 transition-colors hover:bg-white/10"
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-lime-400 text-[12px] font-bold text-petrol-800 shadow-sm">
              {initials}
            </div>
            <div className="text-left hidden sm:block leading-tight">
              <div className="text-[13px] font-semibold text-white">{user.name}</div>
              <div className="text-[11px] text-white/55">{current?.label ?? user.role}</div>
            </div>
            <ChevronDown
              size={15}
              className={clsx('hidden sm:block text-white/50 transition-transform', open && 'rotate-180')}
            />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] w-72 origin-top-right rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl ring-1 ring-ink-900/5 animate-scale-in"
            >
              <div className="px-2.5 py-2">
                <div className="text-sm font-semibold text-ink-900">{user.name}</div>
                <div className="text-xs text-ink-500">{user.email}</div>
              </div>
              <div className="my-1 h-px bg-ink-100" />
              <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                Switch role
              </div>
              {ROLES.map(({ value, label, desc, icon: Icon }) => {
                const active = value === user.role;
                return (
                  <button
                    key={value}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(value)}
                    className={clsx(
                      'group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                      active ? 'bg-brand-50' : 'hover:bg-ink-50',
                    )}
                  >
                    <span
                      className={clsx(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 transition-colors',
                        active
                          ? 'bg-brand-100 text-brand-700 ring-brand-600/15'
                          : 'bg-ink-100 text-ink-500 ring-ink-200 group-hover:text-ink-700',
                      )}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block text-[13px] font-medium', active ? 'text-brand-800' : 'text-ink-900')}>
                        {label}
                      </span>
                      <span className="block truncate text-[11px] text-ink-500">{desc}</span>
                    </span>
                    {active && <Check size={16} className="shrink-0 text-brand-600" />}
                  </button>
                );
              })}
              <div className="my-1 h-px bg-ink-100" />
              <button
                role="menuitem"
                onClick={() => { setOpen(false); logout(); navigate('/login'); }}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500 ring-1 ring-ink-200">
                  <LogOut size={16} />
                </span>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
