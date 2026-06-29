import { useEffect } from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Imperative API — call from anywhere, including non-React modules (api.ts). */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
};

const config: Record<ToastTone, { icon: typeof Info; ring: string; iconColor: string; rail: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-brand-600/15', iconColor: 'text-brand-600', rail: 'bg-brand-500' },
  error:   { icon: AlertCircle,  ring: 'ring-red-600/15',   iconColor: 'text-red-600',   rail: 'bg-red-500' },
  info:    { icon: Info,         ring: 'ring-sky-600/15',   iconColor: 'text-sky-600',   rail: 'bg-sky-500' },
};

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { icon: Icon, ring, iconColor, rail } = config[item.tone];

  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), 4200);
    return () => clearTimeout(t);
  }, [item.id, dismiss]);

  return (
    <div
      role="status"
      className={clsx(
        'pointer-events-auto relative flex w-80 items-start gap-3 overflow-hidden rounded-xl border border-ink-200/70 bg-white/95 backdrop-blur p-3.5 pr-9 shadow-lg ring-1 animate-slide-in-right',
        ring,
      )}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1', rail)} />
      <Icon size={18} className={clsx('mt-0.5 shrink-0', iconColor)} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink-900">{item.title}</div>
        {item.description && <div className="mt-0.5 text-[13px] text-ink-500">{item.description}</div>}
      </div>
      <button
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2.5">
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} />
      ))}
    </div>
  );
}
