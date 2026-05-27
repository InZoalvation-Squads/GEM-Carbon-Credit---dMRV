import { ReactNode } from 'react';
import clsx from 'clsx';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">{children}</thead>;
}
export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={clsx('border-b border-ink-100', className)}>{children}</tr>;
}
export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={clsx('px-5 py-3 text-left font-medium', className)}>{children}</th>;
}
export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx('px-5 py-3 text-ink-700', className)}>{children}</td>;
}
