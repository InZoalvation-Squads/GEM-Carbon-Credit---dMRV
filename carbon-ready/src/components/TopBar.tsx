import { useStore } from '../store';
import { Menu, Bell, Search } from 'lucide-react';
import { Badge } from './Badge';

export function TopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const user = useStore((s) => s.currentUser);
  return (
    <header className="h-16 bg-white border-b border-ink-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={onOpenSidebar} className="md:hidden text-ink-700" aria-label="Open menu"><Menu /></button>
        <div className="hidden sm:flex items-center gap-2 text-sm text-ink-500">
          <Search size={16} />
          <input className="bg-transparent outline-none placeholder:text-ink-400 text-ink-900" placeholder="Search projects, factors..." />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button aria-label="Notifications" className="text-ink-500 hover:text-ink-900"><Bell size={18} /></button>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-ink-900">{user.name}</div>
            <div className="text-xs text-ink-500">{user.email}</div>
          </div>
          <Badge tone="green">{user.role.replace('_', ' ')}</Badge>
        </div>
      </div>
    </header>
  );
}
