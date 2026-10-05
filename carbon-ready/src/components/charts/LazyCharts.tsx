import { lazy, Suspense } from 'react';
import { ChartSkeleton } from '../ui/Skeleton';
import type { DailyGenerationChart as DailyChart } from './DailyGenerationChart';
import type { MonthlyReductionChart as MonthlyChart } from './MonthlyReductionChart';
import type { ComponentProps } from 'react';

const Daily = lazy(() => import('./DailyGenerationChart').then((module) => ({ default: module.DailyGenerationChart })));
const Monthly = lazy(() => import('./MonthlyReductionChart').then((module) => ({ default: module.MonthlyReductionChart })));

export function DailyGenerationChart(props: ComponentProps<typeof DailyChart>) {
  return <Suspense fallback={<ChartSkeleton height={props.height} />}><Daily {...props} /></Suspense>;
}
export function MonthlyReductionChart(props: ComponentProps<typeof MonthlyChart>) {
  return <Suspense fallback={<ChartSkeleton height={props.height} />}><Monthly {...props} /></Suspense>;
}
