import { ReactNode } from 'react';
import clsx from 'clsx';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-sm border-separate border-spacing-0">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-ink-50/70 text-[11px] uppercase tracking-wider text-ink-500">
      {children}
    </thead>
  );
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}
export function TR({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <tr
      className={clsx(
        '[&>td]:border-b [&>td]:border-ink-100 [&>th]:border-b [&>th]:border-ink-200',
        hover && 'transition-colors hover:bg-brand-50/40',
        className,
      )}
    >
      {children}
    </tr>
  );
}
export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={clsx('px-5 py-3 text-left font-semibold', className)}>{children}</th>;
}
export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx('px-5 py-3 text-ink-700', className)}>{children}</td>;
}
