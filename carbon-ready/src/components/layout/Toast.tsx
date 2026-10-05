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

const config: Record<ToastTone, { icon: typeof Info; iconColor: string; rail: string }> = {
  success: { icon: CheckCircle2, iconColor: 'text-petrol-600', rail: 'bg-petrol-700' },
  error: { icon: AlertCircle, iconColor: 'text-state-rejected', rail: 'bg-state-rejected' },
  info: { icon: Info, iconColor: 'text-state-review', rail: 'bg-state-review' },
};

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { icon: Icon, iconColor, rail } = config[item.tone];

  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), 4200);
    return () => clearTimeout(t);
  }, [item.id, dismiss]);

  return (
    <div
      className={clsx(
        'pointer-events-auto relative flex w-[min(20rem,calc(100vw-2rem))] items-start gap-3 overflow-hidden rounded-sheet border border-rule bg-surface p-3.5 pr-12 animate-slide-in-right',
      )}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1', rail)} />
      <Icon size={18} aria-hidden className={clsx('mt-0.5 shrink-0', iconColor)} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{item.title}</div>
        {item.description && <div className="mt-0.5 text-sm text-ink-secondary">{item.description}</div>}
      </div>
      <button
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md text-ink-meta transition-colors hover:bg-petrol-50 hover:text-ink"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2.5">
      <div aria-live="polite" aria-relevant="additions text" className="flex flex-col gap-2.5">
        {toasts.filter((t) => t.tone !== 'error').map((t) => <ToastRow key={t.id} item={t} />)}
      </div>
      <div role="alert" aria-relevant="additions text" className="flex flex-col gap-2.5">
        {toasts.filter((t) => t.tone === 'error').map((t) => <ToastRow key={t.id} item={t} />)}
      </div>
    </div>
  );
}
