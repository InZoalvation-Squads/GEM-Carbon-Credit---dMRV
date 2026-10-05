import { SelectHTMLAttributes, forwardRef, ReactNode, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
interface Props extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; children: ReactNode; }
export const Select = forwardRef<HTMLSelectElement, Props>(function Select({ label, className, children, id, ...rest }, ref) {
  const generatedId = useId();
  const inputId = id ?? rest.name ?? generatedId;
  return <div className="block">
    {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-secondary">{label}</label>}
    <span className="relative block">
      <select ref={ref} id={inputId} className={clsx('block h-10 w-full appearance-none rounded-sheet border border-rule-strong bg-surface pl-3 pr-9 text-sm text-ink focus:border-petrol-600 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-petrol-600', className)} {...rest}>{children}</select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-meta" />
    </span>
  </div>;
});
