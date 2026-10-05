import { FileSpreadsheet, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import clsx from 'clsx';
import { Badge, type Tone } from './Badge';
import { CATEGORY_LABEL, STATE_LABEL } from '../../lib/labels';
import type { EvidenceCategory, EvidenceStatus, FileKind, PddState, RecIssueState } from '../../types';

// One vocabulary for project, verification, PDD, REC and chain record states.
export const STATUS_STYLES = {
  draft: 'bg-ink-100 text-ink-600 ring-ink-500/15',
  superseded: 'bg-ink-100 text-ink-600 ring-ink-500/15',
  retired: 'bg-ink-100 text-ink-600 ring-ink-500/15',
  deprecated: 'bg-ink-100 text-ink-600 ring-ink-500/15',
  archived: 'bg-ink-100 text-ink-600 ring-ink-500/15',
  submitted: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  under_review: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  under_validation: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  revision_required: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  suspended: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  approved: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  active: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  registered: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  issued: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  anchored: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  verified: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  rejected: 'bg-red-50 text-red-700 ring-red-600/15',
} as const;
export type LedgerState = keyof typeof STATUS_STYLES;
const labels: Record<LedgerState, string> = {
  ...STATE_LABEL, active: 'Active', suspended: 'Suspended', archived: 'Archived', retired: 'Retired', deprecated: 'deprecated',
  anchored: 'Anchored', verified: 'Verified', under_validation: 'Under Validation',
  registered: 'Registered', issued: 'Issued', superseded: 'Superseded',
};
export function StatusBadge({ state, label, className }: { state: LedgerState; label?: string; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLES[state], className)}>
    {(state === 'anchored' || state === 'verified') && <Link2 size={14} aria-hidden />}
    {label ?? labels[state]}
  </span>;
}
const categoryTone: Record<EvidenceCategory, Tone> = {
  meter_reading: 'green', utility_bill: 'blue', commissioning_report: 'violet',
  site_photo: 'amber', maintenance_report: 'amber', supporting_evidence: 'gray', verification_report: 'violet',
};
export function CategoryChip({ category }: { category: EvidenceCategory }) {
  return <Badge tone={categoryTone[category]}>{CATEGORY_LABEL[category]}</Badge>;
}
export function FileKindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const cls = clsx('shrink-0', className);
  if (kind === 'pdf') return <FileText size={16} aria-hidden className={clsx(cls, 'text-red-500')} />;
  if (kind === 'xlsx') return <FileSpreadsheet size={16} aria-hidden className={clsx(cls, 'text-brand-600')} />;
  return <ImageIcon size={16} aria-hidden className={clsx(cls, 'text-sky-500')} />;
}
export function PddStatusBadge({ state }: { state: PddState }) { return <StatusBadge state={state} />; }
export function RecIssueStatusBadge({ state }: { state: RecIssueState }) { return <StatusBadge state={state} />; }
export function EvidenceStatusDot({ status }: { status: EvidenceStatus }) {
  const map: Record<EvidenceStatus, string> = {
    active: 'bg-brand-500',
    superseded: 'bg-ink-300',
    archived: 'bg-amber-400',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500 capitalize">
      <span aria-hidden className={clsx('w-1.5 h-1.5 rounded-full', map[status])} />
      {status}
    </span>
  );
}
