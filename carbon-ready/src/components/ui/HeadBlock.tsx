import { ReactNode } from 'react';
import clsx from 'clsx';
export interface HeadFigure { label: string; value: ReactNode; unit?: ReactNode; source?: ReactNode; }
export function HeadBlock({ figures, className }: { figures: HeadFigure[]; className?: string }) {
  return <dl className={clsx('grid grid-cols-1 divide-y divide-ink-100 rounded-xl border border-ink-200/80 bg-white shadow-card sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0', className)}>
    {figures.map(({ label, value, unit, source }, i) => <div key={`${label}-${i}`} className="min-w-0 px-5 py-4">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="mt-2 text-[26px] font-bold leading-none text-ink-900 ledger-figure">{value}{unit && <span className="ml-2 text-sm text-ink-secondary">{unit}</span>}</dd>
      {source && <dd className="mt-2 text-xs text-ink-meta">{source}</dd>}
    </div>)}
  </dl>;
}
