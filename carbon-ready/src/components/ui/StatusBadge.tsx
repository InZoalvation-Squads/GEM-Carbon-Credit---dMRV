import { FileSpreadsheet, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import clsx from 'clsx';
import { Badge, type Tone } from './Badge';
import { CATEGORY_LABEL, STATE_LABEL } from '../../lib/labels';
import type { EvidenceCategory, EvidenceStatus, FileKind, PddState, RecIssueState } from '../../types';

// One vocabulary for project, verification, PDD, REC and chain record states.
export const STATUS_STYLES = {
  draft: 'border-rule-strong bg-surface text-ink-secondary',
  submitted: 'border-state-review/30 bg-state-review/10 text-state-review',
  under_review: 'border-state-review/30 bg-state-review/10 text-state-review',
  under_validation: 'border-state-review/30 bg-state-review/10 text-state-review',
  revision_required: 'border-state-revision/30 bg-state-revision/5 text-state-revision',
  approved: 'border-petrol-700 bg-petrol-700 text-on-petrol',
  active: 'border-petrol-700 bg-petrol-700 text-on-petrol',
  registered: 'border-petrol-700 bg-petrol-700 text-on-petrol',
  issued: 'border-petrol-700 bg-petrol-700 text-on-petrol',
  anchored: 'border-lime-400 bg-lime-400 text-petrol-800',
  verified: 'border-lime-400 bg-lime-400 text-petrol-800',
  rejected: 'border-state-rejected/30 bg-state-rejected/10 text-state-rejected',
  suspended: 'border-state-rejected/30 bg-state-rejected/10 text-state-rejected',
  deprecated: 'border-state-rejected/30 bg-state-rejected/10 text-state-rejected',
  retired: 'border-state-rejected/30 bg-state-rejected/10 text-state-rejected',
  archived: 'border-state-rejected/30 bg-state-rejected/10 text-state-rejected',
  superseded: 'border-rule-strong bg-surface text-ink-secondary',
} as const;
export type LedgerState = keyof typeof STATUS_STYLES;
const labels: Record<LedgerState, string> = {
  ...STATE_LABEL, active: 'Active', suspended: 'Suspended', archived: 'Archived', retired: 'Retired', deprecated: 'deprecated',
  anchored: 'Anchored', verified: 'Verified', under_validation: 'Under Validation',
  registered: 'Registered', issued: 'Issued', superseded: 'Superseded',
};
export function StatusBadge({ state, label, className }: { state: LedgerState; label?: string; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-sheet border px-2 py-0.5 text-xs font-medium', STATUS_STYLES[state], className)}>
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
  if (kind === 'pdf') return <FileText size={16} aria-hidden className={clsx(cls, 'text-state-rejected')} />;
  if (kind === 'xlsx') return <FileSpreadsheet size={16} aria-hidden className={clsx(cls, 'text-petrol-600')} />;
  return <ImageIcon size={16} aria-hidden className={clsx(cls, 'text-state-review')} />;
}
export function PddStatusBadge({ state }: { state: PddState }) { return <StatusBadge state={state} />; }
export function RecIssueStatusBadge({ state }: { state: RecIssueState }) { return <StatusBadge state={state} />; }
export function EvidenceStatusDot({ status }: { status: EvidenceStatus }) {
  return <StatusBadge state={status} label={status} />;
}
