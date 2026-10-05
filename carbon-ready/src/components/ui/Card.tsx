import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> { interactive?: boolean; }
export function Card({ className, children, interactive, ...rest }: CardProps) {
  return <div className={clsx('rounded-sheet border border-rule bg-surface', interactive && 'cursor-pointer transition-colors hover:border-rule-strong hover:bg-petrol-50', className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3"><h2 className="text-sm font-semibold text-ink">{title}</h2>{action}</div>;
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 py-4', className)}>{children}</div>;
}
export { Card as Sheet, CardHeader as SheetHeader, CardBody as SheetBody };
