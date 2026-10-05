import { ReactNode } from 'react';
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    {icon && <div aria-hidden className="mb-4 text-petrol-600">{icon}</div>}
    <div className="text-base font-semibold text-ink">{title}</div>
    {hint && <div className="mt-1 max-w-md text-sm text-ink-secondary">{hint}</div>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
