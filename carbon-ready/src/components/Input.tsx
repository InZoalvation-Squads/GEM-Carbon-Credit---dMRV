import { InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className, id, ...rest }, ref
) {
  const inputId = id ?? rest.name;
  return (
    <label className="block">
      {label && <span className="block mb-1 text-sm font-medium text-ink-700">{label}</span>}
      <input
        ref={ref} id={inputId}
        className={clsx(
          'block w-full rounded-md border border-ink-200 bg-white px-3 h-10 text-sm shadow-sm placeholder:text-ink-400',
          'focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
          error && 'border-red-400', className
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
});
