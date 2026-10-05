import { useDeferredValue, useMemo, useState } from 'react';
import { Plus, FileText } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button, LinkButton } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
import { Segmented } from '../components/ui/Segmented';
import { HeadBlock } from '../components/ui/HeadBlock';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { useStore } from '../store';
import { api } from '../lib/api';
import { fmtDate } from '../lib/date';
import { RecIssueModal } from '../components/rec/RecIssueModal';
import type { RecIssueRequest, RecIssueState } from '../types';

const STATES: (RecIssueState | 'all')[] = ['all', 'draft', 'submitted', 'issued', 'rejected'];
const STATE_CHIP_LABEL: Record<RecIssueState | 'all', string> = {
  all: 'All', draft: 'Draft', submitted: 'Submitted', issued: 'Issued', rejected: 'Rejected',
};

export function RecIssuance() {
  const recIssues = useStore((s) => s.recIssues);
  const projects = useStore((s) => s.projects);
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  const role = useStore((s) => s.currentUser.role);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const canCreate = role === 'project_owner' || role === 'esg_manager';
  const canReview = role === 'verifier' || role === 'admin';

  const hasRecProject = useMemo(
    () => projects.some((p) =>
      pdds.some((d) => d.project_id === p.id && d.state === 'registered'
        && methodologies.find((m) => m.id === d.methodology_id)?.standard === 'REC')),
    [projects, pdds, methodologies],
  );

  const [filter, setFilter] = useState<RecIssueState | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [editingRow, setEditingRow] = useState<RecIssueRequest | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const deferredFilter = useDeferredValue(filter);
  const rows = useMemo(
    () => recIssues.filter((r) => (deferredFilter === 'all' ? true : r.state === deferredFilter)),
    [recIssues, deferredFilter],
  );

  const { draft, submitted, issued, issuedMwh } = useMemo(() => {
    const draft = recIssues.filter((r) => r.state === 'draft').length;
    const submitted = recIssues.filter((r) => r.state === 'submitted').length;
    const issued = recIssues.filter((r) => r.state === 'issued');
    return { draft, submitted, issued, issuedMwh: issued.reduce((sum, r) => sum + (r.applied_mwh ?? r.total_production_mwh), 0) };
  }, [recIssues]);

  async function doSubmit(id: string) {
    setBusyId(id);
    try {
      await api.submitRecIssue(id);
    } finally {
      setBusyId(null);
    }
  }
  async function doDelete(id: string) {
    setBusyId(id);
    try {
      await api.deleteRecIssue(id);
    } finally {
      setBusyId(null);
    }
  }
  async function doApprove(id: string) {
    setBusyId(id);
    try {
      await api.approveRecIssue(id);
    } finally {
      setBusyId(null);
    }
  }
  async function doReject(id: string) {
    if (!reason.trim()) return;
    setBusyId(id);
    try {
      await api.rejectRecIssue(id, reason.trim());
      setRejectingId(null);
      setReason('');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="REC Issuance"
        subtitle="SF-04 Issue Requests — ขอออกใบรับรอง I-REC(E) จากข้อมูลการผลิตจริง"
        action={canCreate ? (
          <Button onClick={() => setCreating(true)}><Plus size={16} /> Issue Request</Button>
        ) : undefined}
      />

      <HeadBlock className="mb-6" figures={[
        { label: 'Draft', value: draft, source: 'not yet submitted' },
        { label: 'Submitted', value: submitted, source: 'awaiting Local Issuer' },
        { label: 'Issued', value: issued.length, source: 'requests issued' },
        { label: 'MWh issued', value: issuedMwh.toLocaleString(), source: 'I-REC(E) certificates' },
      ]} />
      <Segmented className="mb-4" label="REC state" value={filter} onChange={setFilter}
        options={STATES.map((state) => ({ value: state, label: STATE_CHIP_LABEL[state] }))} />
      {!hasRecProject ? (
        <Card><EmptyState title="No REC-registered projects yet"
          hint="Register a project under the REC track (SF-02) before requesting I-REC(E) issuance." /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState illustration="/illustrations/empty-filter.webp" title="No issue requests match this filter" hint="Try another state chip above, or create a new SF-04 issue request." /></Card>
      ) : (
        <ChainList>
                {rows.map((r) => {
                  const mwh = r.applied_mwh ?? r.total_production_mwh;
                  const busy = busyId === r.id;
                  // The server requires non-blank receiving fields at submit
                  // time (SF-04 §2) — disable Submit here too so the row
                  // action never 400s; แก้ไข opens the draft for editing so
                  // the missing fields can be filled in.
                  const receivingIncomplete = !r.receiving_org_name?.trim() || !r.receiving_account_id?.trim();
                  return (
                    <BlockRow key={r.id} blockId={r.id} state={r.state}
                      to={`/rec-issuance/${r.id}/official`} figure={projectName.get(r.project_id) ?? r.project_id}
                      source={<>{fmtDate(r.period_start)} – {fmtDate(r.period_end)} · {r.request_type}</>}>
                      <div className="mt-2 font-mono text-base">{mwh.toLocaleString()} MWh</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <LinkButton to={`/rec-issuance/${r.id}/official`} title="เอกสารฟอร์ม Evident SF-04" size="sm" variant="ghost"><FileText size={14} /> SF-04</LinkButton>
                          {r.state === 'draft' && canCreate && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setEditingRow(r)}>แก้ไข</Button>
                              <span title={receivingIncomplete ? 'กรอก Receiving account ใน draft ก่อน submit' : undefined}>
                                <Button size="sm" variant="secondary" disabled={receivingIncomplete} loading={busy} onClick={() => doSubmit(r.id)}>Submit</Button>
                              </span>
                              <Button size="sm" variant="ghost" loading={busy} onClick={() => doDelete(r.id)}>Delete</Button>
                            </>
                          )}
                          {r.state === 'submitted' && canReview && rejectingId !== r.id && (
                            <>
                              <Button size="sm" loading={busy} onClick={() => doApprove(r.id)}>Approve</Button>
                              <Button size="sm" variant="danger" onClick={() => { setRejectingId(r.id); setReason(''); }}>Reject</Button>
                            </>
                          )}
                          {r.state === 'submitted' && canReview && rejectingId === r.id && (
                            <>
                              <Input
                                label="Rejection reason" placeholder="Reason for rejection"
                                value={reason} onChange={(e) => setReason(e.target.value)}
                                className="h-8 w-48 text-xs"
                              />
                              <Button size="sm" variant="danger" disabled={!reason.trim()} loading={busy} onClick={() => doReject(r.id)}>Confirm</Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>Cancel</Button>
                            </>
                          )}
                          {r.state === 'issued' && (
                            <span className="text-xs text-ink-meta">Issued {r.issued_at ? fmtDate(r.issued_at) : ''}</span>
                          )}
                          {r.state === 'rejected' && r.rejection_reason && (
                            <span className="text-xs text-state-rejected" title={r.rejection_reason}>Rejected</span>
                          )}
                        </div>
                    </BlockRow>
                  );
                })}
        </ChainList>
      )}
      {creating && <RecIssueModal onClose={() => setCreating(false)} />}
      {editingRow && <RecIssueModal editing={editingRow} onClose={() => setEditingRow(null)} />}
    </div>
  );
}
