import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { DailyGenerationChart } from '../components/charts/DailyGenerationChart';
import { MonthlyReductionChart } from '../components/charts/MonthlyReductionChart';
import { useDashboardSummary } from '../store/selectors';
import { useStore } from '../store';
import { ACTION_LABEL } from '../lib/labels';
import { formatKwh, formatNumber } from '../lib/format';
import { fmtDateTime } from '../lib/date';
import { Zap, Leaf, FolderKanban, Clock, Activity } from 'lucide-react';

export function Dashboard() {
  const summary = useDashboardSummary();
  const audit = useStore((s) => s.audit).slice(0, 6);

  const kpis = [
    { label: 'Total Generation', value: formatKwh(summary.kpis.total_generation_kwh), icon: <Zap size={20} /> },
    { label: 'Carbon Reduction', value: `${formatNumber(summary.kpis.total_reduction_tco2e, 2)} tCO₂e`, icon: <Leaf size={20} /> },
    { label: 'Active Projects', value: summary.kpis.active_projects, icon: <FolderKanban size={20} /> },
    {
      label: 'Latest Upload',
      value: summary.kpis.latest_upload_at ? fmtDateTime(summary.kpis.latest_upload_at) : '—',
      icon: <Clock size={20} />,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio Overview"
        title="Dashboard"
        subtitle="Realtime overview of your solar rooftop portfolio"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => (
          <div key={k.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 70}ms` }}>
            <KpiCard label={k.label} value={k.value} icon={k.icon} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily Generation Trend" />
          <CardBody><DailyGenerationChart data={summary.daily_generation} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent Activity" />
          <CardBody>
            {audit.length === 0 ? (
              <EmptyState icon={<Activity size={22} />} title="No activity yet" hint="Actions across the platform will appear here." />
            ) : (
              <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-ink-200">
                {audit.map((a) => (
                  <li key={a.id} className="relative pl-6">
                    <span className="absolute left-0 top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                    <div className="text-sm font-medium text-ink-900">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-400">{fmtDateTime(a.created_at)}</div>
                  </li>
                ))}
              </ol>
            )}
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
