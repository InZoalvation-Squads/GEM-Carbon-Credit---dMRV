import { ReactNode } from 'react';
import clsx from 'clsx';
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('max-h-[70vh] overflow-auto', className)}><table className="w-full border-separate border-spacing-0 text-sm tnum">{children}</table></div>;
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-sunk text-sm text-ink-secondary">{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) { return <tbody>{children}</tbody>; }
export function TR({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <tr className={clsx('[&>td]:h-11 [&>td]:border-b [&>td]:border-rule [&>th]:border-b [&>th]:border-rule', hover && 'transition-colors hover:bg-petrol-50', className)}>{children}</tr>;
}
export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={clsx('bg-surface-sunk px-5 py-3 text-left font-medium', className)}>{children}</th>;
}
export function TD({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx('px-5 py-3 text-ink-secondary', className)}>{children}</td>;
}
