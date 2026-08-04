import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, Gauge, Leaf, Plus, TrendingUp } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { KpiCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/layout/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
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
  const navigate = useNavigate();
  const verifications = useStore((s) => s.verifications);
  const projects = useStore((s) => s.projects);
  const role = useStore((s) => s.currentUser.role);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const [filter, setFilter] = useState<VerificationState | 'all' | 'open'>('open');
  const [requesting, setRequesting] = useState(false);
  const canRequest = role === 'project_owner' || role === 'esg_manager';

  const rows = useMemo(
    () => verifications.filter((v) =>
      filter === 'all' ? true : filter === 'open' ? OPEN_STATES.includes(v.state) : v.state === filter),
    [verifications, filter]
  );

  const open = verifications.filter((v) => ['submitted', 'under_review', 'revision_required'].includes(v.state)).length;
  const approved = verifications.filter((v) => v.state === 'approved');
  const approvedKg = approved.reduce((s, v) => s + v.reduction_kgco2e, 0);

  return (
    <div>
      <PageHeader
        title="Verifications"
        subtitle="Review packages across all projects, sorted by SLA risk. Approvals are hash-sealed and anchored on Hedera."
        action={canRequest ? (
          <Button onClick={() => setRequesting(true)}><Plus size={16} /> Request verification</Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Open packages" value={open} hint="awaiting review" icon={<Clock size={20} />} />
        <KpiCard label="Median cycle" value="5.2" hint="days · target ≤ 7" icon={<Gauge size={20} />} />
        <KpiCard label="Revision rate" value="24%" hint="last 90 days" icon={<TrendingUp size={20} />} />
        <KpiCard label="Approved" value={approved.length} hint={`${formatTco2e(approvedKg)} sealed`} icon={<Leaf size={20} />} />
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
            {s === 'all' ? 'All' : s === 'open' ? 'Open' : STATE_LABEL[s]}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Package</TH>
                <TH className="hidden md:table-cell">Owner</TH>
                <TH>State</TH>
                <TH className="hidden sm:table-cell text-right">Reduction</TH>
                <TH>SLA</TH>
                <TH><span className="sr-only">Open</span></TH>
              </TR>
            </THead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="p-0">
                  <EmptyState title="No packages match this filter" hint="Try another state chip above, or request a new verification from a registered project." />
                </td></tr>
              )}
              {rows.map((v) => {
                const sla = v.locked_at ? null : slaDays(v.submitted_at);
                const breached = sla != null && sla >= v.sla_target_days;
                return (
                  <TR key={v.id} className="cursor-pointer hover:bg-brand-50/40" >
                    <TD>
                      <button onClick={() => navigate(`/verifications/${v.id}`)} className="text-left">
                        <div className="font-medium text-ink-900">{projectName.get(v.project_id) ?? v.project_id}</div>
                        <div className="text-[12px] text-ink-500">
                          {fmtDate(v.monitoring_period_start)} – {fmtDate(v.monitoring_period_end)}
                        </div>
                        <span className="font-mono text-[11px] text-ink-400">{v.id}</span>
                      </button>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <div className="text-ink-700">{v.owner_name}</div>
                    </TD>
                    <TD><StatusBadge state={v.state} /></TD>
                    <TD className="hidden sm:table-cell text-right font-medium">{formatTco2e(v.reduction_kgco2e)}</TD>
                    <TD>
                      {sla == null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        <span className={breached ? 'font-medium text-red-600' : 'text-ink-600'}>{sla}d <span className="text-ink-400">/ target {v.sla_target_days}d</span></span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <button onClick={() => navigate(`/verifications/${v.id}`)} aria-label={`Open ${v.id}`} className="text-ink-400 hover:text-brand-600">
                        <ChevronRight size={16} />
                      </button>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      {requesting && <RequestVerificationModal onClose={() => setRequesting(false)} />}
    </div>
  );
}
