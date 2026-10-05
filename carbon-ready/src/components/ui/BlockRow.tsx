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
interface Props extends Omit<HTMLAttributes<HTMLLIElement>, 'id'> {
  blockId: string; figure: ReactNode; source: ReactNode; state: LedgerState;
  hash?: string; to?: string; statusLabel?: string;
  magnitude?: { value: number; visibleValues: readonly number[] };
}
export function BlockRow({ blockId, figure, source, state, hash, to, statusLabel, magnitude, className, children, ...rest }: Props) {
  const anchored = state === 'anchored' || state === 'verified';
  const filled = anchored || ['approved', 'active', 'registered', 'issued'].includes(state);
  const diameter = magnitude && magnitudeDiameter(magnitude.value, magnitude.visibleValues);
  return <li className={clsx('relative grid grid-cols-[5rem_minmax(0,1fr)] gap-6 border-b border-rule bg-surface px-4 py-4 last:border-b-0 hover:bg-petrol-50 sm:pr-5', anchored && 'bg-lime-300/30', className)} {...rest}>
    <span className="min-w-0 self-start break-all pr-4 font-mono text-xs text-ink-meta">{blockId}</span>
    <span aria-hidden data-anchored={anchored} className={clsx('absolute left-[73px] top-6 z-[1] ledger-node h-4 w-4 rounded-full border-2 border-petrol-700', filled ? 'bg-petrol-700' : 'bg-surface', anchored && 'ring-2 ring-lime-400 ring-offset-2 ring-offset-surface')} />
    <div className="min-w-0 sm:flex sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xl font-medium text-ink ledger-figure">
          {diameter && <span aria-hidden className="shrink-0 rounded-full bg-petrol-700" style={{ width: diameter, height: diameter }} />}
          {to ? <Link to={to} className="rounded-sheet hover:underline">{figure}</Link> : figure}
        </div>
        <div className="mt-1 text-sm text-ink-secondary">{source}</div>
        {children}
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 sm:mt-0 sm:justify-end">
        <StatusBadge state={state} label={statusLabel} />
        {hash && <HashChip value={hash} />}
      </div>
    </div>
  </li>;
}
export function ChainList({ children, className, framed = true, ...rest }: HTMLAttributes<HTMLOListElement> & { framed?: boolean }) {
  return <div className={clsx('relative isolate overflow-hidden bg-surface', framed && 'rounded-sheet border border-rule', className)}>
    <span aria-hidden className="pointer-events-none absolute bottom-8 left-20 top-8 z-[1] w-0.5 bg-petrol-700" />
    <ol {...rest}>{children}</ol>
  </div>;
}
