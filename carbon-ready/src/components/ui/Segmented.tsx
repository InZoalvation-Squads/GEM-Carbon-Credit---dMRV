import { ReactNode } from 'react';
import clsx from 'clsx';
export function Segmented<T extends string>({ options, value, onChange, label, className }: {
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>;
  value: T; onChange: (value: T) => void; label: string; className?: string;
}) {
  return <div role="group" aria-label={label} className={clsx('inline-flex flex-wrap gap-1 rounded-sheet border border-rule-strong bg-surface p-1', className)}>
    {options.map((item) => <button key={item.value} type="button" aria-pressed={value === item.value}
      disabled={item.disabled} onClick={() => onChange(item.value)}
      className={clsx('min-h-10 min-w-10 rounded-sheet px-3 text-sm font-medium transition-colors disabled:opacity-50', value === item.value ? 'bg-petrol-700 text-on-petrol' : 'text-ink-secondary hover:bg-petrol-50')}>
      {item.label}
    </button>)}
  </div>;
}
