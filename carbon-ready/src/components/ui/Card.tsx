import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> { interactive?: boolean; }
export function Card({ className, children, interactive, ...rest }: CardProps) {
  return <div className={clsx('rounded-xl border border-ink-200/80 bg-white shadow-card', interactive && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-ink-200 cursor-pointer', className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-ink-100"><h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{title}</h2>{action}</div>;
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 py-4', className)}>{children}</div>;
}
export { Card as Sheet, CardHeader as SheetHeader, CardBody as SheetBody };
