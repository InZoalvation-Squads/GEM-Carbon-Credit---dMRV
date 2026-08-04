import { ReactNode } from 'react';
import clsx from 'clsx';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Optional delta indicator, e.g. "+12%" */
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
}
export function KpiCard({ label, value, hint, icon, trend }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* brand accent rail */}
      <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-gradient opacity-70" />
      <div className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</div>
          <div className="mt-2 text-[26px] font-bold leading-none text-ink-900 tnum">{value}</div>
          <div className="mt-2 flex items-center gap-2">
            {trend && (
              <span
                className={clsx(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  trend.direction === 'up' && 'bg-brand-50 text-brand-700',
                  trend.direction === 'down' && 'bg-red-50 text-red-600',
                  trend.direction === 'flat' && 'bg-ink-100 text-ink-500',
                )}
              >
                {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '–'} {trend.value}
              </span>
            )}
            {hint && <div className="text-xs text-ink-500 truncate">{hint}</div>}
          </div>
        </div>
        {icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-600/10 transition-colors group-hover:bg-brand-100">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
