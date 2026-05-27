import { ReactNode } from 'react';
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="text-ink-300 mb-3">{icon}</div>}
      <div className="text-sm font-semibold text-ink-900">{title}</div>
      {hint && <div className="mt-1 text-sm text-ink-500 max-w-md">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
