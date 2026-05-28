import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, Gauge, Leaf, TrendingUp } from 'lucide-react';
import { Card, CardBody } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { KpiCard } from '../components/KpiCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useStore } from '../store';
import { STATE_LABEL } from '../lib/labels';
import { formatTco2e } from '../lib/format';
import { fmtDate } from '../lib/date';
import type { VerificationState } from '../types';

const STATES: (VerificationState | 'all')[] = ['all', 'submitted', 'under_review', 'revision_required', 'approved', 'rejected'];

function slaDays(submitted_at: string | null): number | null {
  if (!submitted_at) return null;
  return Math.max(0, Math.round((Date.now() - new Date(submitted_at).getTime()) / 86_400_000));
}

export function Verifications() {
  const navigate = useNavigate();
  const verifications = useStore((s) => s.verifications);
  const [filter, setFilter] = useState<VerificationState | 'all'>('all');

  const rows = useMemo(
    () => verifications.filter((v) => filter === 'all' || v.state === filter),
    [verifications, filter]
  );

  const open = verifications.filter((v) => ['submitted', 'under_review', 'revision_required'].includes(v.state)).length;
  const approved = verifications.filter((v) => v.state === 'approved');
  const approvedKg = approved.reduce((s, v) => s + v.reduction_kgco2e, 0);

  return (
    <div>
      <PageHeader title="Verifications" subtitle="Review packages across all projects, sorted by SLA risk. Approvals are hash-sealed for Hedera Guardian anchoring (Sprint 3)." />

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
            {s === 'all' ? 'All' : STATE_LABEL[s]}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Package</TH>
                <TH className="hidden md:table-cell">Project</TH>
                <TH>State</TH>
                <TH className="hidden sm:table-cell text-right">Reduction</TH>
                <TH>SLA</TH>
                <TH><span className="sr-only">Open</span></TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((v) => {
                const sla = v.locked_at ? null : slaDays(v.submitted_at);
                const breached = sla != null && sla >= v.sla_target_days;
                return (
                  <TR key={v.id} className="cursor-pointer hover:bg-brand-50/40" >
                    <TD>
                      <button onClick={() => navigate(`/verifications/${v.id}`)} className="text-left">
                        <span className="font-mono text-xs font-semibold text-brand-700">{v.id}</span>
                        <div className="font-medium text-ink-900">
                          {fmtDate(v.monitoring_period_start)} – {fmtDate(v.monitoring_period_end)}
                        </div>
                      </button>
                    </TD>
                    <TD className="hidden md:table-cell text-ink-500">{v.owner_name}</TD>
                    <TD><StatusBadge state={v.state} /></TD>
                    <TD className="hidden sm:table-cell text-right font-medium">{formatTco2e(v.reduction_kgco2e)}</TD>
                    <TD>
                      {sla == null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        <span className={breached ? 'font-medium text-red-600' : 'text-ink-600'}>{sla}d / {v.sla_target_days}d</span>
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
    </div>
  );
}
