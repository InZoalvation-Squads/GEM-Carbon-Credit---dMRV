import { InputHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';
interface Props extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className, id, 'aria-describedby': describedBy, ...rest }, ref,
) {
  const generatedId = useId();
  const inputId = id ?? rest.name ?? generatedId;
  const errorId = `${inputId}-error`;
  return <div className="block">
    {label && <label htmlFor={inputId} className="block mb-1.5 text-[13px] font-medium text-ink-700">{label}</label>}
    <input ref={ref} id={inputId} aria-invalid={error ? true : rest['aria-invalid']}
      aria-describedby={[describedBy, error && errorId].filter(Boolean).join(' ') || undefined}
      className={clsx(
          'block w-full rounded-lg border bg-white px-3 h-10 text-sm shadow-xs placeholder:text-ink-500',
          'transition-colors duration-150 hover:border-ink-300',
          'focus:outline-none focus:ring-4',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
            : 'border-ink-200 focus:border-brand-500 focus:ring-brand-500/15',
          className)} {...rest} />
    {error && <span id={errorId} className="mt-1 block text-xs text-red-600">{error}</span>}
  </div>;
});
