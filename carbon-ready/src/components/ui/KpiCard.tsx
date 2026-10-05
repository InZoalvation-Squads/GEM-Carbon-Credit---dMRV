import { ReactNode } from 'react';
import { HeadBlock } from './HeadBlock';
interface Props {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
}
/** Compatibility adapter until Dashboard adopts a single HeadBlock in phase 2. */
export function KpiCard({ label, value, hint, trend }: Props) {
  return <HeadBlock figures={[{ label, value, source: <>{trend && <span className="mr-2">{trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '–'} {trend.value}</span>}{hint}</> }]} />;
}
