import { ReactNode } from 'react';
import clsx from 'clsx';
export interface HeadFigure { label: string; value: ReactNode; unit?: ReactNode; source?: ReactNode; }
export function HeadBlock({ figures, className }: { figures: HeadFigure[]; className?: string }) {
  return <dl className={clsx('grid grid-cols-2 rounded-xl border border-ink-200/80 bg-white shadow-card sm:grid-cols-none sm:grid-flow-col sm:auto-cols-fr', className)}>
    {figures.map(({ label, value, unit, source }, i) => <div key={`${label}-${i}`} className={clsx('min-w-0 border-ink-100 px-4 py-3 sm:border-b-0 sm:px-5 sm:py-4 sm:[&:not(:last-child)]:border-r sm:last:border-r-0', i % 2 === 0 && 'border-r', i < figures.length - (figures.length % 2 || 2) && 'border-b')}>
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="mt-2 text-[20px] font-bold leading-none text-ink-900 ledger-figure sm:text-[26px]">
        {typeof value === 'string' && /^\d{1,2} [A-Za-z]{3} \d{4}, /.test(value)
          ? <><span className="whitespace-nowrap">{value.split(', ')[0]},</span>{' '}<span className="whitespace-nowrap">{value.split(', ')[1]}</span></>
          : value}
        {unit && <span className="ml-2 text-sm text-ink-secondary">{unit}</span>}
      </dd>
      {source && <dd className="mt-2 text-xs text-ink-meta">{source}</dd>}
    </div>)}
  </dl>;
}
