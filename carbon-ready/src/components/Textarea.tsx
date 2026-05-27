import { TextareaHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, className, id, ...rest }, ref
) {
  return (
    <label className="block">
      {label && <span className="block mb-1 text-sm font-medium text-ink-700">{label}</span>}
      <textarea
        ref={ref} id={id ?? rest.name}
        className={clsx(
          'block w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm',
          'focus:border-brand-500 focus:ring-1 focus:ring-brand-500', className
        )}
        {...rest}
      />
    </label>
  );
});
