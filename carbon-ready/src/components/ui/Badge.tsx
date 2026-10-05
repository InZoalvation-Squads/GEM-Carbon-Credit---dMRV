import { ReactNode } from 'react';
import clsx from 'clsx';

export type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet';
const tones: Record<Tone, string> = {
  green:  'bg-brand-50 text-brand-700 ring-brand-600/15',
  amber:  'bg-amber-50 text-amber-700 ring-amber-600/15',
  red:    'bg-red-50 text-red-700 ring-red-600/15',
  gray:   'bg-ink-100 text-ink-600 ring-ink-500/15',
  blue:   'bg-sky-50 text-sky-700 ring-sky-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
};

const dotTones: Record<Tone, string> = {
  green:  'bg-brand-500',
  amber:  'bg-amber-500',
  red:    'bg-red-500',
  gray:   'bg-ink-400',
  blue:   'bg-sky-500',
  violet: 'bg-violet-500',
};

export function Badge({ tone = 'gray', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
    {dot && <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", dotTones[tone])} />}{children}
  </span>;
}
