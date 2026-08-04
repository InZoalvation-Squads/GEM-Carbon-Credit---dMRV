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
      {label && <span className="block mb-1.5 text-[13px] font-medium text-ink-700">{label}</span>}
      <textarea
        ref={ref} id={id ?? rest.name}
        className={clsx(
          'block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-ink-400',
          'transition-colors duration-150 hover:border-ink-300',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
          className,
        )}
        {...rest}
      />
    </label>
  );
});
