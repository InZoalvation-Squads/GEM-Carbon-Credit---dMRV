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
      {label && <span className="block mb-1.5 text-[13px] font-medium text-ink-700">{label}</span>}
      <input
        ref={ref} id={inputId}
        className={clsx(
          'block w-full rounded-lg border bg-white px-3 h-10 text-sm shadow-xs placeholder:text-ink-400',
          'transition-colors duration-150 hover:border-ink-300',
          'focus:outline-none focus:ring-4',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
            : 'border-ink-200 focus:border-brand-500 focus:ring-brand-500/15',
          className,
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
});
