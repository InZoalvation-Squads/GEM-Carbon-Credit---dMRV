import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-ink-200 bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {action}
    </div>
  );
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 py-4', className)}>{children}</div>;
}
