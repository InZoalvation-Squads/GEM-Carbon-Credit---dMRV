import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-[0_1px_2px_rgba(6,78,59,0.25)] hover:shadow-glow hover:brightness-[1.03] active:brightness-95',
  secondary:
    'bg-white border border-ink-200 text-ink-800 shadow-xs hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100',
  ghost:
    'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200/60',
  danger:
    'bg-red-600 text-white shadow-[0_1px_2px_rgba(127,29,29,0.3)] hover:bg-red-700 hover:shadow-[0_8px_24px_-8px_rgba(220,38,38,0.45)] active:bg-red-800',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'relative inline-flex items-center justify-center font-medium select-none',
        'transition-[transform,box-shadow,background-color,filter] duration-150 ease-out',
        'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} aria-hidden />}
      {children}
    </button>
  );
});
