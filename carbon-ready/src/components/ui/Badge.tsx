import { ReactNode } from 'react';
import clsx from 'clsx';

export type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet';
const tones: Record<Tone, string> = {
  green: 'bg-petrol-700 text-on-petrol border-petrol-700',
  amber: 'bg-state-revision/5 text-state-revision border-state-revision/30',
  red: 'bg-state-rejected/10 text-state-rejected border-state-rejected/30',
  gray: 'bg-surface text-ink-secondary border-rule-strong',
  blue: 'bg-state-review/10 text-state-review border-state-review/30',
  violet: 'bg-state-review/10 text-state-review border-state-review/30',
};
export function Badge({ tone = 'gray', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-sheet border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
    {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
  </span>;
}
