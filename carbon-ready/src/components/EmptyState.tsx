import { ReactNode } from 'react';
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ink-50 text-ink-400 ring-1 ring-ink-200/70">
          {icon}
        </div>
      )}
      <div className="text-[15px] font-semibold text-ink-900">{title}</div>
      {hint && <div className="mt-1 text-sm text-ink-500 max-w-md">{hint}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
