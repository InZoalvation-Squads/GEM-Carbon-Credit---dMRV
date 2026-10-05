import { TextareaHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';
interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; }
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea({ label, className, id, ...rest }, ref) {
  const generatedId = useId();
  const inputId = id ?? rest.name ?? generatedId;
  return <div className="block">
    {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-secondary">{label}</label>}
    <textarea ref={ref} id={inputId} className={clsx('block min-h-10 w-full rounded-sheet border border-rule-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-meta focus:border-petrol-600 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-petrol-600', className)} {...rest} />
  </div>;
});
