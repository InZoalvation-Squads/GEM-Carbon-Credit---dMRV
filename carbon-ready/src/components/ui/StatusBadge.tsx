import { FileSpreadsheet, FileText, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from './Badge';
import { CATEGORY_LABEL, STATE_LABEL } from '../../lib/labels';
import type { EvidenceCategory, EvidenceStatus, FileKind, VerificationState, PddState } from '../../types';

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet';

const stateTone: Record<VerificationState, Tone> = {
  draft: 'gray',
  submitted: 'blue',
  under_review: 'violet',
  revision_required: 'amber',
  approved: 'green',
  rejected: 'red',
};

export function StatusBadge({ state }: { state: VerificationState }) {
  return <Badge tone={stateTone[state]}>{STATE_LABEL[state]}</Badge>;
}

const categoryTone: Record<EvidenceCategory, Tone> = {
  meter_reading: 'green',
  utility_bill: 'blue',
  commissioning_report: 'violet',
  site_photo: 'amber',
  maintenance_report: 'amber',
  supporting_evidence: 'gray',
  verification_report: 'violet',
};

export function CategoryChip({ category }: { category: EvidenceCategory }) {
  return <Badge tone={categoryTone[category]}>{CATEGORY_LABEL[category]}</Badge>;
}

export function FileKindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const cls = clsx('shrink-0', className);
  if (kind === 'pdf') return <FileText size={16} className={clsx(cls, 'text-red-500')} />;
  if (kind === 'xlsx') return <FileSpreadsheet size={16} className={clsx(cls, 'text-brand-600')} />;
  return <ImageIcon size={16} className={clsx(cls, 'text-sky-500')} />;
}

const pddStateTone: Record<PddState, Tone> = {
  draft: 'gray', submitted: 'blue', under_validation: 'violet',
  revision_required: 'amber', registered: 'green', rejected: 'red',
};
const pddStateLabel: Record<PddState, string> = {
  draft: 'Draft', submitted: 'Submitted', under_validation: 'Under Validation',
  revision_required: 'Revision Required', registered: 'Registered', rejected: 'Rejected',
};
export function PddStatusBadge({ state }: { state: PddState }) {
  return <Badge tone={pddStateTone[state]}>{pddStateLabel[state]}</Badge>;
}

export function EvidenceStatusDot({ status }: { status: EvidenceStatus }) {
  const map: Record<EvidenceStatus, string> = {
    active: 'bg-brand-500',
    superseded: 'bg-ink-300',
    archived: 'bg-amber-400',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500 capitalize">
      <span className={clsx('w-1.5 h-1.5 rounded-full', map[status])} />
      {status}
    </span>
  );
}
