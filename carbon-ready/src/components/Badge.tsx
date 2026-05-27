import { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';
const tones: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-700 ring-brand-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  red:   'bg-red-50 text-red-700 ring-red-100',
  gray:  'bg-ink-100 text-ink-700 ring-ink-200',
  blue:  'bg-sky-50 text-sky-700 ring-sky-100',
};
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>
      {children}
    </span>
  );
}
