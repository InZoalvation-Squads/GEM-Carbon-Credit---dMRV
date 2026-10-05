import { ReactNode, useId, useRef } from 'react';
import clsx from 'clsx';
export interface TabItem<T extends string> { value: T; label: ReactNode; content: ReactNode; disabled?: boolean; }
export function Tabs<T extends string>({ items, value, onChange, label, className }: {
  items: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => item.disabled ? -1 : index).filter((index) => index >= 0);
  return <div className={className}>
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-rule">
      {items.map((item, index) => <button key={item.value} ref={(el) => { refs.current[index] = el; }}
        type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
        aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} disabled={item.disabled}
        onClick={() => onChange(item.value)}
        onKeyDown={(event) => {
          const current = enabled.indexOf(index);
          let next: number | undefined;
          if (event.key === 'ArrowRight') next = enabled[(current + 1) % enabled.length];
          if (event.key === 'ArrowLeft') next = enabled[(current - 1 + enabled.length) % enabled.length];
          if (event.key === 'Home') next = enabled[0];
          if (event.key === 'End') next = enabled[enabled.length - 1];
          if (next !== undefined) { event.preventDefault(); refs.current[next]?.focus(); onChange(items[next].value); }
        }}
        className={clsx('min-h-11 shrink-0 border-b-2 px-1 text-sm font-medium transition-colors disabled:opacity-50', value === item.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-secondary hover:text-brand-800')}>
        {item.label}
      </button>)}
    </div>
    {items.map((item, index) => <div key={item.value} role="tabpanel" id={`${id}-panel-${index}`}
      aria-labelledby={`${id}-tab-${index}`} hidden={value !== item.value} tabIndex={0} className="py-4">
      {value === item.value && item.content}
    </div>)}
  </div>;
}
