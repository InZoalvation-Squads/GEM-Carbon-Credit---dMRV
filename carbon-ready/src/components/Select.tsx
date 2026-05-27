import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react';
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
      {label && <span className="block mb-1 text-sm font-medium text-ink-700">{label}</span>}
      <select
        ref={ref} id={id ?? rest.name}
        className={clsx(
          'block w-full rounded-md border border-ink-200 bg-white px-3 h-10 text-sm shadow-sm',
          'focus:border-brand-500 focus:ring-1 focus:ring-brand-500', className
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
});
