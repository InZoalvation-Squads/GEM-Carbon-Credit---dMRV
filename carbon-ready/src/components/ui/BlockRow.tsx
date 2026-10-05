import { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { HashChip } from './HashChip';
import { StatusBadge, type LedgerState } from './StatusBadge';

/** Equal values receive equal decorative dots; only the visible set determines the ramp. */
export function magnitudeDiameter(value: number, visibleValues: readonly number[]): number {
  const values = visibleValues.filter(Number.isFinite);
  if (!Number.isFinite(value) || !values.length) return 4;
  const quantile = values.filter((item) => item < value).length / values.length;
  return [4, 6, 8, 10, 12][Math.min(4, Math.floor(quantile * 5))];
}
type Density = 'default' | 'compact';
interface Props extends Omit<HTMLAttributes<HTMLLIElement>, 'id'> {
  blockId: string; figure: ReactNode; source: ReactNode; state: LedgerState;
  hash?: string; to?: string; statusLabel?: string;
  magnitude?: { value: number; visibleValues: readonly number[] };
  density?: Density;
}
export function BlockRow({ blockId, figure, source, state, hash, to, statusLabel, magnitude, density = 'default', className, children, ...rest }: Props) {
  const anchored = state === 'anchored' || state === 'verified';
  const filled = anchored || ['approved', 'active', 'registered', 'issued'].includes(state);
  const diameter = magnitude && magnitudeDiameter(magnitude.value, magnitude.visibleValues);
  const compact = density === 'compact';
  const shortId = blockId.length > 11 ? `${blockId.slice(0, 6)}…${blockId.slice(-4)}` : blockId;
  const id = <span title={blockId} className="shrink-0 whitespace-nowrap font-mono text-xs text-ink-meta">
    <span aria-hidden="true">{shortId}</span><span className="sr-only">{blockId}</span>
  </span>;
  const lead = <>
    {diameter && <span aria-hidden className="shrink-0 rounded-full bg-brand-600" style={{ width: diameter, height: diameter }} />}
    {to ? <Link to={to} className="min-w-0 whitespace-normal rounded-sheet hover:underline">{figure}</Link> : figure}
  </>;
  return <li className={clsx('relative grid border-b border-rule last:border-b-0 hover:bg-brand-50', compact ? 'grid-cols-[minmax(0,1fr)] py-3 pl-8 pr-4' : 'grid-cols-[6rem_minmax(0,1fr)] gap-6 px-4 py-4 sm:pr-5', anchored ? 'bg-brand-50' : 'bg-white', className)} {...rest}>
    {!compact && <div className="min-w-0 self-start">{id}</div>}
    <span aria-hidden data-anchored={anchored} className={clsx('absolute z-[1] ledger-node h-4 w-4 rounded-full border-2', compact ? 'left-2 top-4' : 'left-[112px] top-6', filled ? 'border-brand-500 bg-brand-500' : 'border-ink-200 bg-surface', anchored && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-surface')} />
    {compact ? <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 whitespace-normal text-sm font-medium text-ink ledger-figure">{lead}</div>
        <StatusBadge state={state} label={statusLabel} className="shrink-0 whitespace-nowrap" />
      </div>
      {/* Wraps between units (time, id, hash) so a narrow column never clips them; each unit stays whole. */}
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-xs text-ink-meta">
        <span className="shrink-0 whitespace-nowrap">{source}</span><span aria-hidden="true">·</span>{id}
        {hash && <HashChip value={hash} className="min-w-0 !text-xs" />}
      </div>
      {children}
    </div> : <div className="min-w-0 sm:flex sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xl font-medium text-ink ledger-figure">
          {lead}
        </div>
        <div className="mt-1 text-sm text-ink-secondary">{source}</div>
        {children}
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 sm:mt-0 sm:justify-end">
        <StatusBadge state={state} label={statusLabel} />
        {hash && <HashChip value={hash} />}
      </div>
    </div>}
  </li>;
}
export function ChainList({ children, className, framed = true, density = 'default', ...rest }: HTMLAttributes<HTMLOListElement> & { framed?: boolean; density?: Density }) {
  return <div className={clsx('relative isolate overflow-hidden bg-surface', framed && 'rounded-xl border border-ink-200/80 shadow-card', className)}>
    <span aria-hidden className={clsx('pointer-events-none absolute z-[1] w-0.5 bg-ink-200', density === 'compact' ? 'bottom-6 left-[15px] top-6' : 'bottom-8 left-[119px] top-8')} />
    <ol {...rest}>{children}</ol>
  </div>;
}
