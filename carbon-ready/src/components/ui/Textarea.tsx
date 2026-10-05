import { TextareaHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';
interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; }
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea({ label, className, id, ...rest }, ref) {
  const generatedId = useId();
  const inputId = id ?? rest.name ?? generatedId;
  return <div className="block">
    {label && <label htmlFor={inputId} className="block mb-1.5 text-[13px] font-medium text-ink-700">{label}</label>}
    <textarea ref={ref} id={inputId} className={clsx(
          'block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-ink-500',
          'transition-colors duration-150 hover:border-ink-300',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
          className)} {...rest} />
  </div>;
});
