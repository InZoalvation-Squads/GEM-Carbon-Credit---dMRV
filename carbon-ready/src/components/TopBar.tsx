import { useStore } from '../store';
import { Menu, Bell, Moon, Globe } from 'lucide-react';

export function TopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const user = useStore((s) => s.currentUser);
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="relative z-30 h-16 shrink-0 bg-header-gradient text-white border-b border-black/20 px-3 md:px-6 flex items-center justify-between">
      {/* Left: menu + brand */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-3">
          <img
            src="/gem-logo.svg"
            alt="GEM Carbon Credit"
            className="h-7 md:h-8 w-auto select-none"
            draggable={false}
          />
          <span className="hidden lg:inline-flex items-center rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
            dMRV
          </span>
        </div>
      </div>

      {/* Right: actions + user */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          aria-label="Toggle theme"
          className="hidden sm:grid h-9 w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Moon size={17} />
        </button>
        <button
          aria-label="Language"
          className="hidden sm:inline-flex items-center gap-1.5 h-9 rounded-lg px-2.5 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Globe size={15} /> TH
        </button>
        <button
          aria-label="Notifications"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lime-400 ring-2 ring-petrol-600" />
        </button>

        <div className="mx-1 h-6 w-px bg-white/15 hidden sm:block" />

        <div className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-1 sm:pr-2.5 transition-colors hover:bg-white/10">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-lime-400 text-[12px] font-bold text-petrol-800 shadow-sm">
            {initials}
          </div>
          <div className="text-left hidden sm:block leading-tight">
            <div className="text-[13px] font-semibold text-white">{user.name}</div>
            <div className="text-[11px] text-white/55 capitalize">{user.role.replace(/_/g, ' ')}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
