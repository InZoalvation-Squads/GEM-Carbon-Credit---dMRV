import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, className, children, id, ...rest }, ref
) {
  return (
    <label className="block">
      {label && <span className="block mb-1.5 text-[13px] font-medium text-ink-700">{label}</span>}
      <div className="relative">
        <select
          ref={ref} id={id ?? rest.name}
          className={clsx(
            'block w-full appearance-none rounded-lg border border-ink-200 bg-white pl-3 pr-9 h-10 text-sm shadow-xs',
            'transition-colors duration-150 hover:border-ink-300',
            'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
      </div>
    </label>
  );
});
