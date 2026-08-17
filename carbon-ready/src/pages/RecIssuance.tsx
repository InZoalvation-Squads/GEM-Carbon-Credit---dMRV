import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Zap, FileCheck2, Clock, Leaf, FileText } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { KpiCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/layout/PageHeader';
import { RecIssueStatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { useStore } from '../store';
import { api } from '../lib/api';
import { fmtDate } from '../lib/date';
import { RecIssueModal } from '../components/rec/RecIssueModal';
import type { RecIssueState } from '../types';

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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(
    () => recIssues.filter((r) => (filter === 'all' ? true : r.state === filter)),
    [recIssues, filter],
  );

  const draft = recIssues.filter((r) => r.state === 'draft').length;
  const submitted = recIssues.filter((r) => r.state === 'submitted').length;
  const issued = recIssues.filter((r) => r.state === 'issued');
  const issuedMwh = issued.reduce((sum, r) => sum + (r.applied_mwh ?? r.total_production_mwh), 0);

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Draft" value={draft} hint="not yet submitted" icon={<Clock size={20} />} />
        <KpiCard label="Submitted" value={submitted} hint="awaiting Local Issuer" icon={<FileCheck2 size={20} />} />
        <KpiCard label="Issued" value={issued.length} hint="requests issued" icon={<Zap size={20} />} />
        <KpiCard label="MWh issued" value={issuedMwh.toLocaleString()} hint="I-REC(E) certificates" icon={<Leaf size={20} />} />
      </div>

      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-full border border-ink-200 bg-white p-1 w-fit max-w-full">
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
              (filter === s ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900')
            }
          >
            {STATE_CHIP_LABEL[s]}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="p-0">
          {!hasRecProject ? (
            <EmptyState
              title="No REC-registered projects yet"
              hint="Register a project under the REC track (SF-02) before requesting I-REC(E) issuance."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH className="hidden md:table-cell">Period</TH>
                  <TH className="text-right">MWh</TH>
                  <TH className="hidden sm:table-cell">Request type</TH>
                  <TH>State</TH>
                  <TH><span className="sr-only">Actions</span></TH>
                </TR>
              </THead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="p-0">
                    <EmptyState title="No issue requests match this filter" hint="Try another state chip above, or create a new SF-04 issue request." />
                  </td></tr>
                )}
                {rows.map((r) => {
                  const mwh = r.applied_mwh ?? r.total_production_mwh;
                  const busy = busyId === r.id;
                  // The server requires non-blank receiving fields at submit
                  // time (SF-04 §2) — disable Submit here too so the row
                  // action never 400s; there is no edit UI yet, so recovery
                  // would otherwise be delete + recreate.
                  const receivingIncomplete = !r.receiving_org_name?.trim() || !r.receiving_account_id?.trim();
                  return (
                    <TR key={r.id}>
                      <TD>
                        <div className="font-medium text-ink-900">{projectName.get(r.project_id) ?? r.project_id}</div>
                        <span className="font-mono text-[11px] text-ink-400">{r.id}</span>
                      </TD>
                      <TD className="hidden md:table-cell">
                        <div className="text-ink-700">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</div>
                      </TD>
                      <TD className="text-right font-medium">{mwh.toLocaleString()} MWh</TD>
                      <TD className="hidden sm:table-cell text-ink-700">{r.request_type}</TD>
                      <TD><RecIssueStatusBadge state={r.state} /></TD>
                      <TD className="text-right">
                        <div className="flex justify-end items-center gap-2">
                          <Link to={`/rec-issuance/${r.id}/official`} title="เอกสารฟอร์ม Evident SF-04">
                            <Button size="sm" variant="ghost"><FileText size={14} /> SF-04</Button>
                          </Link>
                          {r.state === 'draft' && canCreate && (
                            <>
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
                                aria-label="Rejection reason" placeholder="Reason for rejection"
                                value={reason} onChange={(e) => setReason(e.target.value)}
                                className="h-8 w-48 text-xs"
                              />
                              <Button size="sm" variant="danger" disabled={!reason.trim()} loading={busy} onClick={() => doReject(r.id)}>Confirm</Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>Cancel</Button>
                            </>
                          )}
                          {r.state === 'issued' && (
                            <span className="text-xs text-ink-500">Issued {r.issued_at ? fmtDate(r.issued_at) : ''}</span>
                          )}
                          {r.state === 'rejected' && r.rejection_reason && (
                            <span className="text-xs text-red-600" title={r.rejection_reason}>Rejected</span>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      {creating && <RecIssueModal onClose={() => setCreating(false)} />}
    </div>
  );
}
