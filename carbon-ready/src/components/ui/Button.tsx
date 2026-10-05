import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}
const variants: Record<Variant, string> = {
  primary: 'bg-petrol-700 text-on-petrol hover:bg-petrol-800 active:bg-petrol-900',
  secondary: 'border border-rule-strong bg-surface text-ink hover:bg-petrol-50',
  ghost: 'bg-transparent text-petrol-600 hover:bg-petrol-50',
  danger: 'bg-state-rejected text-on-petrol hover:bg-state-rejected/90',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-8 min-w-8 px-3 text-sm gap-1.5',
  md: 'min-h-10 min-w-10 px-4 text-sm gap-2',
  lg: 'min-h-11 min-w-11 px-5 text-base gap-2',
};
const base = 'max-sm:min-h-11 max-sm:min-w-11 inline-flex items-center justify-center rounded-sheet font-medium select-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol-600';
/** Navigation actions use the same paints and targets without nesting a button in a link. */
export function LinkButton({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...rest} />;
}
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...rest }, ref,
) {
  return (
    <button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined}
      className={clsx(base, 'disabled:opacity-50 disabled:cursor-not-allowed', variants[variant], sizes[size], className)} {...rest}>
      {loading && <Loader2 className="animate-spin motion-reduce:animate-none" size={16} aria-hidden />}
      {children}
    </button>
  );
});
