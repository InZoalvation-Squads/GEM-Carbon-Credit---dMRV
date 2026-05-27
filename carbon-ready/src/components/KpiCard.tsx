import { ReactNode } from 'react';
import { Card } from './Card';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}
export function KpiCard({ label, value, hint, icon }: Props) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-ink-900">{value}</div>
          {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
        </div>
        {icon && <div className="text-brand-600">{icon}</div>}
      </div>
    </Card>
  );
}
