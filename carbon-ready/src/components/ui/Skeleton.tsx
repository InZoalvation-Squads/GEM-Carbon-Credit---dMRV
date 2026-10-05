import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { Table, THead, TR, TH, TD } from './Table';

/** Decorative placeholder; the containing boundary announces loading once. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={clsx('skeleton', className)} style={style} />;
}

export function SkeletonRows({ rows = 6, columns = 4, block = false, entity = false }: { rows?: number; columns?: number; block?: boolean; entity?: boolean }) {
  if (!block) return <div aria-hidden="true" data-skeleton-rows={rows}>
    <Table mobileLabels={entity ? Array.from({ length: columns }, () => '') : undefined}>
      <THead><TR>{Array.from({ length: columns }, (_, index) => <TH key={index}><Skeleton className="h-[21px] w-2/3" /></TH>)}</TR></THead>
      <tbody>{Array.from({ length: rows }, (_, index) => <TR key={index}>
        {Array.from({ length: columns }, (_, cell) => <TD key={cell}>
          {entity && <Skeleton className="mb-1 h-[21px] w-1/3 sm:hidden" />}<Skeleton className="h-[21px]" />
        </TD>)}
      </TR>)}</tbody>
    </Table>
  </div>;
  return <div aria-hidden="true" className="divide-y divide-rule" data-skeleton-rows={rows}>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="grid min-h-[156px] grid-cols-[4rem_1fr] gap-6 p-5">
          <Skeleton className="mt-1 h-4" /><div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-3/4" /></div>
        </div>)}
  </div>;
}

export function HeadBlockSkeleton({ figures = 4, sources = true }: { figures?: number; sources?: boolean }) {
  return <div aria-hidden="true" data-skeleton-figures={figures} className="grid grid-cols-1 divide-y divide-ink-100 rounded-xl border border-ink-200/80 bg-white shadow-card sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0">
    {Array.from({ length: figures }, (_, index) => <div key={index} className="min-w-0 px-5 py-4">
      <Skeleton className="h-[21px] w-2/3" /><Skeleton className="mt-2 h-[26px] w-3/4" />{sources && <Skeleton className="mt-2 h-[18px] w-full" />}
    </div>)}
  </div>;
}

/** Same 280px plot height as both Recharts components; no import-time chart work. */
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <div role="status" aria-label="Loading chart" className="relative pl-14 pb-8 pt-2 pr-8" style={{ height }}>
    <span className="sr-only">Loading</span>
    <div aria-hidden="true" className="flex h-full flex-col justify-between border-b border-l border-rule">
      {[0, 1, 2, 3].map((line) => <div key={line} className="w-full border-t border-rule" />)}
    </div>
    <div aria-hidden="true" className="absolute bottom-10 left-16 right-10 h-1/3"><Skeleton className="h-full" /></div>
  </div>;
}
