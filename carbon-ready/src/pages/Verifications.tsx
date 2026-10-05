import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { HeadBlock } from '../components/ui/HeadBlock';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
import { Segmented } from '../components/ui/Segmented';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { useStore } from '../store';
import { RequestVerificationModal } from '../components/evidence/RequestVerificationModal';
import { STATE_LABEL } from '../lib/labels';
import { formatTco2e } from '../lib/format';
import { fmtDate } from '../lib/date';
import type { VerificationState } from '../types';

const OPEN_STATES: VerificationState[] = ['submitted', 'under_review', 'revision_required'];
const STATES: (VerificationState | 'all' | 'open')[] = ['open', 'all', 'submitted', 'under_review', 'revision_required', 'approved', 'rejected'];
function slaDays(submitted_at: string | null): number | null {
  if (!submitted_at) return null;
  return Math.max(0, Math.round((Date.now() - new Date(submitted_at).getTime()) / 86_400_000));
}
export function Verifications() {
  const verifications = useStore((s) => s.verifications);
  const projects = useStore((s) => s.projects);
  const role = useStore((s) => s.currentUser.role);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const [filter, setFilter] = useState<VerificationState | 'all' | 'open'>('open');
  const [requesting, setRequesting] = useState(false);
  const canRequest = role === 'project_owner' || role === 'esg_manager';
  const rows = useMemo(() => verifications.filter((v) => filter === 'all' ? true : filter === 'open' ? OPEN_STATES.includes(v.state) : v.state === filter), [verifications, filter]);
  const open = verifications.filter((v) => OPEN_STATES.includes(v.state)).length;
  const approved = verifications.filter((v) => v.state === 'approved');
  const approvedKg = approved.reduce((s, v) => s + v.reduction_kgco2e, 0);
  return <div>
    <PageHeader title="Verifications" subtitle="Review packages across all projects, sorted by SLA risk. Approvals are hash-sealed and anchored on Hedera."
      action={canRequest ? <Button onClick={() => setRequesting(true)}><Plus size={16} /> Request verification</Button> : undefined} />
    <HeadBlock className="mb-6" figures={[
      { label: 'Open packages', value: open, source: 'awaiting review' },
      { label: 'Approved', value: approved.length, source: `${formatTco2e(approvedKg)} sealed` },
    ]} />
    <Segmented className="mb-4" label="Verification state" value={filter} onChange={setFilter}
      options={STATES.map((s) => ({ value: s, label: s === 'all' ? 'All' : s === 'open' ? 'Open' : STATE_LABEL[s] }))} />
    {rows.length ? <ChainList>{rows.map((v) => {
      const sla = v.locked_at ? null : slaDays(v.submitted_at);
      const breached = sla != null && sla >= v.sla_target_days;
      return <BlockRow key={v.id} blockId={v.id} to={`/verifications/${v.id}`}
        state={v.credential_id ? 'anchored' : v.state} hash={v.hash_value ?? undefined}
        figure={projectName.get(v.project_id) ?? v.project_id}
        source={<>{fmtDate(v.monitoring_period_start)} – {fmtDate(v.monitoring_period_end)} · {v.factors_snapshot}</>}
        magnitude={{ value: v.reduction_kgco2e, visibleValues: rows.map((r) => r.reduction_kgco2e) }}>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-ink-meta">Owner</dt><dd>{v.owner_name}</dd></div>
          <div><dt className="text-ink-meta">Reduction</dt><dd className="font-mono">{formatTco2e(v.reduction_kgco2e)}</dd></div>
          <div><dt className="text-ink-meta">SLA</dt><dd className={'font-mono ' + (breached ? 'text-state-rejected' : 'text-ink-secondary')}>{sla == null ? '—' : <>{sla}d / target {v.sla_target_days}d</>}</dd></div>
        </dl>
      </BlockRow>;
    })}</ChainList> : <Card><EmptyState title="No packages match this filter" hint="Try another state chip above, or request a new verification from a registered project." /></Card>}
    {requesting && <RequestVerificationModal onClose={() => setRequesting(false)} />}
  </div>;
}
