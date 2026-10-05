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
    {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-secondary">{label}</label>}
    <input ref={ref} id={inputId} aria-invalid={error ? true : rest['aria-invalid']}
      aria-describedby={[describedBy, error && errorId].filter(Boolean).join(' ') || undefined}
      className={clsx('block h-10 w-full rounded-sheet border bg-surface px-3 text-sm text-ink placeholder:text-ink-meta transition-colors focus:border-petrol-600 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-petrol-600', error ? 'border-state-rejected' : 'border-rule-strong', className)} {...rest} />
    {error && <span id={errorId} className="mt-1 block text-xs text-state-rejected">{error}</span>}
  </div>;
});
