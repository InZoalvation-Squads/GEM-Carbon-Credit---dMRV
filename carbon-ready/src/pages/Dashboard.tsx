import { Card, CardBody, CardHeader } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { PageHeader } from '../components/PageHeader';
import { DailyGenerationChart } from '../components/charts/DailyGenerationChart';
import { MonthlyReductionChart } from '../components/charts/MonthlyReductionChart';
import { useDashboardSummary } from '../store/selectors';
import { useStore } from '../store';
import { formatKwh, formatNumber } from '../lib/format';
import { fmtDateTime } from '../lib/date';
import { Zap, Leaf, FolderKanban, Clock } from 'lucide-react';

export function Dashboard() {
  const summary = useDashboardSummary();
  const audit = useStore((s) => s.audit).slice(0, 6);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Realtime overview of your solar rooftop portfolio" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Generation" value={formatKwh(summary.kpis.total_generation_kwh)} icon={<Zap size={20} />} />
        <KpiCard label="Carbon Reduction" value={`${formatNumber(summary.kpis.total_reduction_tco2e, 2)} tCO₂e`} icon={<Leaf size={20} />} />
        <KpiCard label="Active Projects" value={summary.kpis.active_projects} icon={<FolderKanban size={20} />} />
        <KpiCard
          label="Latest Upload"
          value={summary.kpis.latest_upload_at ? fmtDateTime(summary.kpis.latest_upload_at) : '—'}
          icon={<Clock size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily Generation Trend" />
          <CardBody><DailyGenerationChart data={summary.daily_generation} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent Activity" />
          <CardBody className="space-y-3">
            {audit.length === 0 && <div className="text-sm text-ink-500">No activity yet.</div>}
            {audit.map((a) => (
              <div key={a.id} className="text-sm">
                <div className="font-medium text-ink-900">{a.action.replace(/_/g, ' ').toLowerCase()}</div>
                <div className="text-xs text-ink-500">{fmtDateTime(a.created_at)}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Monthly Carbon Reduction" />
        <CardBody><MonthlyReductionChart data={summary.monthly_reduction} /></CardBody>
      </Card>
    </div>
  );
}
